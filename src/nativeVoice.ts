import { createServer, type Server, type Socket } from 'node:net'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

export interface VoiceCallbacks {
  onText: (text: string) => void
  onStatus: (message: string) => void
  onReady: () => void
  onError: (message: string) => void
}

/** The private Unix socket carries transient text only. No audio or transcripts are written to disk. */
export class NativeVoice {
  private server: Server | null = null
  private socket: Socket | null = null
  private launcher: ChildProcess | null = null
  private directory: string | null = null
  private timeout: ReturnType<typeof setTimeout> | null = null
  private active = false
  private generation = 0

  constructor(private readonly callbacks: VoiceCallbacks) {}

  start(): void {
    this.stop()
    if (process.platform !== 'darwin') {
      this.callbacks.onError('Seguir mi voz requiere macOS en esta versión.')
      return
    }
    const app = resolve(__dirname, '../native/Teleprompter Voice.app')
    if (!existsSync(join(app, 'Contents/MacOS/TeleprompterVoice'))) {
      this.callbacks.onError('Falta el asistente de voz. Ejecuta npm run build:voice en la carpeta del plugin.')
      return
    }
    this.active = true
    const generation = this.generation
    const isCurrent = () => this.active && generation === this.generation
    const fail = (message: string) => { if (isCurrent()) this.fail(message) }
    try {
      // Keep the path short: macOS Unix sockets have a 104-byte path limit.
      this.directory = mkdtempSync('/tmp/inkdrop-voice-')
      const path = join(this.directory, 'speech.sock')
      this.server = createServer(socket => {
        if (!isCurrent() || this.socket) { socket.destroy(); return }
        this.socket = socket
        if (this.timeout) { clearTimeout(this.timeout); this.timeout = null }
        socket.setEncoding('utf8')
        let pending = ''
        socket.on('data', chunk => {
          if (!isCurrent()) return
          pending += chunk
          if (pending.length > 1024 * 1024) { fail('Respuesta de voz demasiado grande. Vuelve a iniciar la escucha.'); return }
          let newline: number
          while ((newline = pending.indexOf('\n')) >= 0 && isCurrent()) {
            const line = pending.slice(0, newline)
            pending = pending.slice(newline + 1)
            try {
              const message = JSON.parse(line)
              if (message.type === 'transcript' && typeof message.text === 'string') this.callbacks.onText(message.text)
              else if (message.type === 'ready') this.callbacks.onReady()
              else if (message.type === 'status' && typeof message.message === 'string') this.callbacks.onStatus(message.message)
              else if (message.type === 'error' && typeof message.message === 'string') this.fail(message.message)
            } catch { this.fail('Respuesta inválida del asistente de voz. Vuelve a iniciar la escucha.') }
          }
        })
        socket.on('error', () => fail('Se interrumpió la conexión con el reconocimiento de voz.'))
        socket.on('close', () => fail('La escucha terminó. Pulsa Play para retomarla.'))
      })
      this.server.on('error', () => fail('No se pudo abrir la conexión local de voz.'))
      this.server.listen(path, () => {
        if (!isCurrent()) return
        // LaunchServices gives the helper its own macOS privacy identity and prompts.
        this.launcher = spawn('/usr/bin/open', ['-n', '-W', app, '--args', '--socket', path], { stdio: 'ignore' })
        this.launcher.on('error', () => fail('No se pudo abrir Teleprompter Voice.'))
        this.launcher.on('exit', () => {
          fail('Teleprompter Voice se cerró. Pulsa Play para volver a intentarlo.')
        })
        this.timeout = setTimeout(() => fail('Teleprompter Voice no respondió. Comprueba si macOS está mostrando un aviso.'), 20000)
      })
    } catch (error) {
      this.fail(`No se pudo iniciar la escucha: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private fail(message: string): void {
    if (!this.active) return
    this.stop()
    this.callbacks.onError(message)
  }

  stop(): void {
    this.active = false
    this.generation++
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = null
    // EOF makes the helper stop its audio engine and terminate, including while awaiting permission.
    this.socket?.destroy()
    this.socket = null
    const directory = this.directory
    if (this.server) {
      this.server.close(() => { if (directory) rmSync(directory, { recursive: true, force: true }) })
      this.server = null
    } else if (directory) rmSync(directory, { recursive: true, force: true })
    this.directory = null
    this.launcher = null
  }
}
