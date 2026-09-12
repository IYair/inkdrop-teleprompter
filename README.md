# Inkdrop Teleprompter

A local-first teleprompter that turns the active Inkdrop note into a clean, responsive reading view while you record. Your script stays in Inkdrop and is never modified.

## Features

- Opens inside the current Inkdrop window or in a dedicated, resizable window.
- Extracts dialogue from YouTube and Reel/TikTok script sections automatically.
- Supports play, pause, restart, 60–240 WPM speed, and 32–104 px text.
- Includes countdown, mirror mode, reading progress, block markers, and presentation profiles.
- Uses the font selected in Inkdrop by default, with access to the fonts installed on your device.
- Can follow your voice on macOS, highlight the phrase being read, and advance at your pace.
- Adapts to the active Inkdrop theme and remembers your reading preferences.
- Keeps notes, audio, transcripts, telemetry, and credentials off the network.

## Install

Install **teleprompter** from **Preferences → Plugins** in Inkdrop, then open any note.

Use the teleprompter icon in the editor view controls, choose **Plugins → Teleprompter → Abrir / Cerrar**, or press:

- macOS: `Cmd+Alt+T`
- Windows/Linux: `Ctrl+Alt+T`
- Dedicated window: add `Shift` to the shortcut

Inside the teleprompter, press `Space` to play or pause, `↑`/`↓` to adjust the pace, `R` to restart, `M` to mirror, and `Esc` to close.

## Script formats

**Automatic** mode recognizes headings such as `# Guion para YouTube` and `# Adaptación para TikTok`, plus blocks labeled `**Voz / diálogo:**`. Choose **Nota limpia** for any other note structure.

## Follow my voice on macOS

Voice following requires macOS 13 or later. The rest of the teleprompter does not require the native voice helper.

1. Open the teleprompter and enable **Seguir mi voz**.
2. Press **Play**. The first time, macOS asks for Speech Recognition and Microphone access for **Teleprompter Voice**.
3. Read at least three words. The current phrase is highlighted and kept in view; fixed-speed scrolling is disabled while this mode is active.
4. Pause naturally and the text waits. To jump or repeat, select a phrase and press **Play** again.

Spanish (Mexico) is preferred, with Spanish (Spain/United States) as local alternatives. If macOS has no local Spanish recognizer, enable Spanish Dictation in System Settings → Keyboard. Proper names or wording that differs significantly from the script may require repeating the phrase or selecting it manually.

Audio and temporary transcripts are processed locally by the bundled macOS helper. They are not saved or sent to an external service.

## Development

Requires Inkdrop 6.1.3 or newer.

```sh
npm install
npm run build
npm run build:voice # macOS 13+, requires Xcode developer tools
npx @inkdropapp/ipm-cli link --dev
```

Enable Developer Mode in Inkdrop, reload the app, and activate the plugin. During development, close any dedicated teleprompter window and deactivate/reactivate the plugin after rebuilding.

```sh
npm test
npm run typecheck
```

## License

[MIT](LICENSE)
