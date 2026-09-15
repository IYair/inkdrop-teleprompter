import AppKit
import AVFoundation
import Speech
import Darwin

// This accessory app owns its microphone/speech permissions, independently of Inkdrop.
final class VoiceService: NSObject, NSApplicationDelegate {
    var socket: Int32 = -1
    var reader: DispatchSourceRead?
    let engine = AVAudioEngine()
    var recognizer: SFSpeechRecognizer?
    var request: SFSpeechAudioBufferRecognitionRequest?
    var task: SFSpeechRecognitionTask?
    var rotation: Timer?
    var generation = 0
    var tapInstalled = false
    var stopping = false
    var recentFailures: [Date] = []
    var lastText = ""
    var language = "es"

    var preferredLocales: [String] {
        language == "en"
            ? ["en-US", "en-GB", "en-CA", "en-AU"]
            : ["es-MX", "es-ES", "es-US"]
    }

    var languageName: String { language == "en" ? "inglés" : "español" }

    func emit(_ value: [String: Any]) {
        guard socket >= 0, let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        let bytes = data + Data([10])
        bytes.withUnsafeBytes { buffer in
            var offset = 0
            while offset < buffer.count {
                let count = Darwin.write(socket, buffer.baseAddress!.advanced(by: offset), buffer.count - offset)
                if count <= 0 { break }
                offset += count
            }
        }
    }

    func fail(_ message: String) {
        emit(["type": "error", "message": message])
        shutdown()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        signal(SIGPIPE, SIG_IGN)
        let args = CommandLine.arguments
        guard let flag = args.firstIndex(of: "--socket"), args.count > flag + 1 else { shutdown(); return }
        let path = args[flag + 1]
        if let languageFlag = args.firstIndex(of: "--language"), args.count > languageFlag + 1 {
            language = args[languageFlag + 1] == "en" ? "en" : "es"
        }
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let pathBytes = Array(path.utf8CString)
        guard pathBytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { shutdown(); return }
        withUnsafeMutableBytes(of: &address.sun_path) { destination in
            for (index, byte) in pathBytes.enumerated() { destination[index] = UInt8(bitPattern: byte) }
        }
        socket = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        let connected = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(socket, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard connected == 0 else { shutdown(); return }
        reader = DispatchSource.makeReadSource(fileDescriptor: socket, queue: .main)
        reader?.setEventHandler { [weak self] in
            guard let self = self else { return }
            var buffer = [UInt8](repeating: 0, count: 1024)
            if Darwin.read(self.socket, &buffer, buffer.count) <= 0 { self.shutdown() }
        }
        reader?.resume()
        emit(["type": "status", "message": "Esperando permisos de macOS…"])
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                guard !self.stopping else { return }
                guard status == .authorized else {
                    self.fail("Permite Reconocimiento de voz para Teleprompter Voice en Ajustes del Sistema → Privacidad y seguridad.")
                    return
                }
                AVCaptureDevice.requestAccess(for: .audio) { allowed in
                    DispatchQueue.main.async {
                        guard !self.stopping else { return }
                        guard allowed else {
                            self.fail("Permite Micrófono para Teleprompter Voice en Ajustes del Sistema → Privacidad y seguridad.")
                            return
                        }
                        self.prepare()
                    }
                }
            }
        }
    }

    func prepare() {
        recognizer = preferredLocales.compactMap {
            SFSpeechRecognizer(locale: Locale(identifier: $0))
        }.first { $0.supportsOnDeviceRecognition }
        guard recognizer != nil else {
            fail("El reconocimiento local en \(languageName) no está disponible. Configura Dictado en \(languageName) en Ajustes del Sistema → Teclado y vuelve a intentarlo.")
            return
        }
        beginSession()
    }

    func stopSession() {
        generation += 1
        rotation?.invalidate()
        rotation = nil
        engine.stop()
        if tapInstalled { engine.inputNode.removeTap(onBus: 0); tapInstalled = false }
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
    }

    func beginSession() {
        guard !stopping, let recognizer = recognizer else { return }
        stopSession()
        let session = generation
        lastText = ""
        let nextRequest = SFSpeechAudioBufferRecognitionRequest()
        nextRequest.shouldReportPartialResults = true
        nextRequest.requiresOnDeviceRecognition = true
        nextRequest.taskHint = .dictation
        request = nextRequest
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            fail("No hay un micrófono disponible. Selecciona una entrada de audio en Ajustes del Sistema → Sonido.")
            return
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in nextRequest.append(buffer) }
        tapInstalled = true
        task = recognizer.recognitionTask(with: nextRequest) { result, error in
            DispatchQueue.main.async {
                guard !self.stopping, self.generation == session else { return }
                if let result = result {
                    let text = result.bestTranscription.formattedString
                    if text != self.lastText {
                        self.lastText = text
                        self.emit(["type": "transcript", "text": text, "final": result.isFinal])
                    }
                    if result.isFinal { self.beginSession(); return }
                }
                if let error = error as NSError? {
                    // Silence may end a recognition task. Start a new task without advancing the script.
                    if error.code == 1110 || error.code == 203 { self.scheduleRestart(session); return }
                    self.recentFailures = self.recentFailures.filter { Date().timeIntervalSince($0) < 15 }
                    self.recentFailures.append(Date())
                    if self.recentFailures.count >= 3 {
                        self.fail("No se pudo iniciar el reconocimiento local. Revisa Dictado en \(self.languageName) y tu micrófono. \(error.localizedDescription)")
                    } else { self.scheduleRestart(session) }
                }
            }
        }
        do {
            engine.prepare()
            try engine.start()
            emit(["type": "ready", "locale": recognizer.locale.identifier])
            // Rotate before the legacy recognizer's task time limit, for long scripts.
            rotation = Timer.scheduledTimer(withTimeInterval: 50, repeats: false) { _ in self.beginSession() }
        } catch { fail("No se pudo abrir el micrófono: \(error.localizedDescription)") }
    }

    func scheduleRestart(_ session: Int) {
        stopSession()
        let expected = generation
        emit(["type": "status", "message": "Retomando escucha…"])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            if !self.stopping && self.generation == expected { self.beginSession() }
        }
    }

    func shutdown() {
        guard !stopping else { return }
        stopping = true
        stopSession()
        reader?.cancel()
        if socket >= 0 { Darwin.close(socket); socket = -1 }
        NSApplication.shared.terminate(nil)
    }
}

if CommandLine.arguments.contains("--check") {
    let locales = ["es-MX", "es-ES", "es-US", "en-US", "en-GB", "en-CA", "en-AU"].map { locale -> [String: Any] in
        let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
        return ["locale": locale, "onDevice": recognizer?.supportsOnDeviceRecognition ?? false]
    }
    let data = try! JSONSerialization.data(withJSONObject: locales)
    print(String(data: data, encoding: .utf8)!)
} else {
    let app = NSApplication.shared
    let service = VoiceService()
    app.delegate = service
    app.setActivationPolicy(.accessory)
    app.run()
}
