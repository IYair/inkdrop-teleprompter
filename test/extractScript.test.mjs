import assert from 'node:assert/strict'
import test from 'node:test'
import { detectScriptLanguage, getScriptOptions } from '../src/extractScript.ts'
import { createCustomScriptProfile } from '../src/scriptProfiles.ts'

const byId = (markdown, id) => getScriptOptions(markdown).find(option => option.id === id)

test('exposes key points between language-neutral markers without leaking into other profiles', () => {
  const note = `# Guion para YouTube

**Voz / diálogo:** Este es el guion largo para la cámara.

# Adaptación para Reel / TikTok

**Voz:** Esta es la versión corta.

<!-- teleprompter:key-points -->
# Puntos clave para improvisar

> Esta instrucción no forma parte de la guía.

## Gancho

- Una sola fuente de ingreso es arriesgada.
- Estoy construyendo tres negocios diferentes.

<!-- /teleprompter:key-points -->

# Notas

- No mostrar en cámara.`

  assert.equal(byId(note, 'youtube')?.text, 'Este es el guion largo para la cámara.')
  assert.equal(byId(note, 'reel')?.text, 'Esta es la versión corta.')
  assert.equal(byId(note, 'keypoints')?.text,
    'Gancho\n\nUna sola fuente de ingreso es arriesgada.\n\nEstoy construyendo tres negocios diferentes.')
  assert.deepEqual(getScriptOptions(note).map(option => option.id),
    ['auto', 'youtube', 'reel', 'keypoints', 'clean'])
})

test('recognizes English scripts, spoken labels and key-point headings', () => {
  const note = `# YouTube Script

**Voice / dialogue:** This is the long script for the camera.

# Reel / TikTok Adaptation

**Voiceover:** This is the short version.

# Key points for improvising

## Hook
- Depending on one income source is risky.
- I am building three different businesses.

# Next steps
- Do not show this.`

  assert.equal(byId(note, 'youtube')?.text, 'This is the long script for the camera.')
  assert.equal(byId(note, 'reel')?.text, 'This is the short version.')
  assert.equal(byId(note, 'keypoints')?.text,
    'Hook\n\nDepending on one income source is risky.\n\nI am building three different businesses.')
})

test('accepts the Spanish marker alias and detects Spanish or English locally', () => {
  const note = `<!-- teleprompter:puntos-clave -->
## Talking points
- Solve a real problem for the customer.
<!-- /teleprompter:puntos-clave -->`

  assert.equal(byId(note, 'keypoints')?.text, 'Solve a real problem for the customer.')
  assert.equal(detectScriptLanguage('Estoy construyendo una agencia de software para mis clientes.'), 'es')
  assert.equal(detectScriptLanguage('I am building a software agency for my clients.'), 'en')
})

test('extracts user-created profiles only between their own markers', () => {
  const interview = createCustomScriptProfile('Entrevista', 'entrevista')
  const tutorial = createCustomScriptProfile('Tutorial paso a paso', 'tutorial')
  assert.ok(interview)
  assert.ok(tutorial)
  const note = `<!-- teleprompter:profile:entrevista -->
# Preguntas
- ¿Cómo empezaste?
- ¿Qué aprendiste?
<!-- /teleprompter:profile:entrevista -->

<!-- teleprompter:profile:tutorial -->
**Voice:** First, open the application.
<!-- /teleprompter:profile:tutorial -->`

  const options = getScriptOptions(note, [interview, tutorial])
  assert.equal(options.find(option => option.id === interview.id)?.text,
    'Preguntas\n\n¿Cómo empezaste?\n\n¿Qué aprendiste?')
  assert.equal(options.find(option => option.id === tutorial.id)?.text, 'First, open the application.')
})
