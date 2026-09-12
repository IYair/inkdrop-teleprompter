import { mkdirSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

if (process.platform !== 'darwin') {
  console.log('El asistente de voz nativo requiere macOS.')
  process.exit(0)
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const app = resolve(root, 'native/Teleprompter Voice.app')
const executable = resolve(app, 'Contents/MacOS/TeleprompterVoice')
const buildDirectory = mkdtempSync(resolve(tmpdir(), 'teleprompter-voice-build-'))
const source = resolve(root, 'native/TeleprompterVoice.swift')
mkdirSync(resolve(app, 'Contents/MacOS'), { recursive: true })
copyFileSync(resolve(root, 'native/Info.plist'), resolve(app, 'Contents/Info.plist'))
try {
  const architectures = ['arm64', 'x86_64']
  const binaries = architectures.map(architecture => {
    const output = resolve(buildDirectory, `TeleprompterVoice-${architecture}`)
    execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-O', '-target', `${architecture}-apple-macos13.0`,
      '-module-cache-path', resolve(buildDirectory, `module-cache-${architecture}`), source, '-o', output,
      '-framework', 'AppKit', '-framework', 'AVFoundation', '-framework', 'Speech'], { stdio: 'inherit' })
    return output
  })
  execFileSync('xcrun', ['lipo', '-create', ...binaries, '-output', executable], { stdio: 'inherit' })
} finally {
  rmSync(buildDirectory, { recursive: true, force: true })
}
// Finder/iCloud metadata on a freshly generated bundle invalidates ad-hoc signing.
execFileSync('xattr', ['-cr', app], { stdio: 'inherit' })
execFileSync('codesign', ['--force', '--sign', '-', '--identifier', 'dev.alianza.inkdrop-teleprompter-voice', app], { stdio: 'inherit' })
console.log('Asistente de voz universal compilado:', app)
