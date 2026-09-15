# Inkdrop Teleprompter

A local-first teleprompter that turns the active Inkdrop note into a clean, responsive reading view while you record. Your script stays in Inkdrop and is never modified.

## Features

- Opens inside the current Inkdrop window or in a dedicated, resizable window.
- Extracts spoken dialogue automatically in Spanish or English.
- Offers a dedicated key-points profile for speaking freely from a compact guide.
- Lets each user create, edit, copy, and delete their own marker-based profiles.
- Supports play, pause, restart, 60–240 WPM speed, and 32–104 px text.
- Includes countdown, mirror mode, reading progress, and block navigation.
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

Use the profile selector in the top bar to choose **Automático**, **Puntos clave**, **Nota limpia**, or one of your personal profiles. This is the only profile selector; reading speed, text size, font, and countdown remain independent controls in the bottom bar.

**Automático** looks for spoken blocks labeled `**Voz / diálogo:**`, `**Narración:**`, `**Voice:**`, `**Dialogue:**`, or `**Voiceover:**`. It ignores visual directions and production notes. When a note does not use spoken labels, choose **Nota limpia** to read all useful note content without Markdown formatting.

### Key-points profile

Wrap a compact speaking guide with these language-neutral markers:

```md
<!-- teleprompter:key-points -->
# Puntos clave para improvisar

## Gancho
- Una sola fuente de ingreso es arriesgada.
- Estoy construyendo tres negocios diferentes.
<!-- /teleprompter:key-points -->
```

The visible heading can also be written as `# Key points for improvising` or `# Talking points`. The marker keeps the guide isolated from the rest of the note, while the **Puntos clave** tab opens it directly.

### Custom profiles

Select the **+** button beside the script tabs to open the profile library. From there you can:

- Remove the built-in **Puntos clave** or **Nota limpia** tab, and restore it later.
- Create up to 20 profiles with your own name and marker.
- Edit the name or marker of any personal profile with its **Editar** button.
- Copy the complete marker pair for a custom profile.
- Delete a custom profile and undo the deletion immediately.

Built-in profiles use **Quitar** and **Restaurar** because their names and behavior are fixed. Profiles you create appear under **Personalizados** and include **Copiar**, **Editar**, and **Eliminar** actions.

For a profile named “Entrevista” with marker `entrevista`, place its content between:

```md
<!-- teleprompter:profile:entrevista -->

## Pregunta principal
- ¿Cómo empezaste?
- ¿Qué aprendiste durante el proceso?

<!-- /teleprompter:profile:entrevista -->
```

Profile markers are language-neutral, so the content between them can be written in Spanish, English, or another language supported by the reading view.

### How markers work

- The opening marker starts the content for that profile; the matching marker with `/` closes it.
- Keep each marker on its own line and write the content between both lines.
- The text outside the pair is ignored when that personal profile is selected.
- Several profile sections can coexist in the same note as long as every pair uses a unique marker.
- Marker values use lowercase letters, numbers, and hyphens. The library normalizes them automatically.
- **Copiar** places both marker lines on the clipboard so you can paste the complete structure into a note.
- Changing only a profile name does not affect existing notes. If you edit its marker, update both marker lines in every note that used the previous value.

Inside a marked section, spoken labels are supported but optional. Without labels, headings and regular text are cleaned and shown as readable blocks. Task-list items and marker comments are not spoken.

## Follow my voice on macOS

Voice following requires macOS 13 or later. The rest of the teleprompter does not require the native voice helper.

1. Open the teleprompter and enable **Seguir mi voz**.
2. Press **Play**. The first time, macOS asks for Speech Recognition and Microphone access for **Teleprompter Voice**.
3. Read at least three words. The current phrase is highlighted and kept in view; fixed-speed scrolling is disabled while this mode is active.
4. Pause naturally and the text waits. To jump or repeat, select a phrase and press **Play** again.

The selected content is detected as Spanish or English. Spanish (Mexico) and English (United States) are preferred, with other local variants as fallbacks. If macOS has no local recognizer for the detected language, enable that Dictation language in System Settings → Keyboard. Proper names or wording that differs significantly from the script may require repeating the phrase or selecting it manually.

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
