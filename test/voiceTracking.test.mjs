import test from 'node:test'
import assert from 'node:assert/strict'
import { VoiceTracker, indexScript, normalizeWords } from '../src/voiceTracking.ts'

const script = [
  'Estoy construyendo tres negocios distintos. Mi agencia de software se llama Alianza Dev. Voy a documentar el proceso real.',
  'También organizo viajes para familias. La tercera fuente de ingresos es un gestor de redes sociales con inteligencia artificial.'
]

test('preserves displayed text, sentence boundaries and accents', () => {
  const index = indexScript(script)
  assert.equal(index.phrases.length, 5)
  assert.equal(index.phrases.filter(p => p.paragraph === 0).map(p => p.text).join(''), script[0])
  assert.deepEqual(normalizeWords('¡También, SOF TWare!'), ['tambien', 'sof', 'tware'])
})

test('follows cumulative interim speech through sentences and paragraphs', () => {
  const tracker = new VoiceTracker(script)
  assert.equal(tracker.match('estoy construyendo tres negocios')?.phrase, 0)
  assert.equal(tracker.match('estoy construyendo tres negocios distintos mi agencia de software')?.phrase, 1)
  assert.equal(tracker.match('mi agencia de software se llama alianza dev voy a documentar el proceso real')?.phrase, 2)
  assert.equal(tracker.match('tambien organizo viajes para familias')?.phrase, 3)
})

test('ignores silence, isolated common words, unrelated speech and duplicate partial results', () => {
  const tracker = new VoiceTracker(script)
  for (const text of ['', 'de', 'y el de', 'hoy tengo ganas de comer pizza']) assert.equal(tracker.match(text), null)
  assert.equal(tracker.match('estoy construyendo tres negocios')?.phrase, 0)
  assert.equal(tracker.match('estoy construyendo tres negocios'), null)
})

test('tolerates a filler, a missing word and a small recognition spelling error', () => {
  for (const text of ['estoy eh construyendo tres negocios distintos', 'estoy construyendo negocios distintos', 'estoy construyendo tres negocio distintos']) {
    assert.equal(new VoiceTracker(script).match(text)?.phrase, 0, text)
  }
})

test('can repeat a nearby phrase and resume from a manually selected distant phrase', () => {
  const tracker = new VoiceTracker(script)
  assert.equal(tracker.match('voy a documentar el proceso real')?.phrase, 2)
  assert.equal(tracker.match('mi agencia de software se llama alianza dev')?.phrase, 1)
  const distant = new VoiceTracker([...Array(30).fill('Un párrafo largo que todavía no estoy leyendo.'), 'Ahora empiezo desde otra frase diferente.'])
  assert.equal(distant.match('ahora empiezo desde otra frase diferente'), null)
  distant.seekPhrase(30)
  assert.equal(distant.match('ahora empiezo desde otra frase diferente')?.phrase, 30)
})
