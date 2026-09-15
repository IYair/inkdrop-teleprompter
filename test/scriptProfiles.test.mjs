import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCustomScriptProfile,
  getCustomProfileMarkers,
  isVisibleScriptProfile,
  normalizeProfileMarker,
  parseCustomScriptProfiles,
  parseHiddenScriptProfiles,
  serializeCustomScriptProfiles,
  updateCustomScriptProfile
} from '../src/scriptProfiles.ts'

test('creates safe language-neutral markers from a profile name', () => {
  assert.equal(normalizeProfileMarker('  Reseña Técnica / Opinión  '), 'resena-tecnica-opinion')
  assert.deepEqual(createCustomScriptProfile('Reseña técnica'), {
    id: 'custom:resena-tecnica',
    label: 'Reseña técnica',
    marker: 'resena-tecnica'
  })
  assert.equal(createCustomScriptProfile('Modo automático', 'auto'), undefined)
})

test('sanitizes stored custom profiles, removes duplicates and enforces valid records', () => {
  const stored = JSON.stringify([
    { label: 'Entrevista', marker: 'entrevista' },
    { label: 'Duplicado', marker: 'Entrevista' },
    { label: '', marker: 'vacio' },
    { label: 'Tutorial', marker: 'tutorial' }
  ])
  const profiles = parseCustomScriptProfiles(stored)
  assert.deepEqual(profiles.map(profile => profile.id), ['custom:entrevista', 'custom:tutorial'])
  assert.deepEqual(parseCustomScriptProfiles(serializeCustomScriptProfiles(profiles)), profiles)
})

test('keeps only removable built-in profiles and generates a complete marker pair', () => {
  assert.deepEqual(parseHiddenScriptProfiles('["keypoints","auto","keypoints","clean","unknown"]'), ['keypoints', 'clean'])
  assert.deepEqual(getCustomProfileMarkers('entrevista'), {
    start: '<!-- teleprompter:profile:entrevista -->',
    end: '<!-- /teleprompter:profile:entrevista -->',
    template: '<!-- teleprompter:profile:entrevista -->\n\n<!-- /teleprompter:profile:entrevista -->'
  })
})

test('shows only the current built-ins, automatic mode and custom profiles', () => {
  assert.equal(isVisibleScriptProfile('auto', false, []), true)
  assert.equal(isVisibleScriptProfile('keypoints', false, []), true)
  assert.equal(isVisibleScriptProfile('clean', false, ['clean']), false)
  assert.equal(isVisibleScriptProfile('youtube', false, []), false)
  assert.equal(isVisibleScriptProfile('reel', false, []), false)
  assert.equal(isVisibleScriptProfile('custom:entrevista', true, []), true)
})

test('updates a custom profile name and marker without allowing collisions', () => {
  const interview = createCustomScriptProfile('Entrevista')
  const tutorial = createCustomScriptProfile('Tutorial')
  assert.ok(interview)
  assert.ok(tutorial)
  const renamed = updateCustomScriptProfile([interview, tutorial], interview.id, 'Conversación', 'charla')
  assert.deepEqual(renamed, {
    profiles: [
      { id: 'custom:charla', label: 'Conversación', marker: 'charla' },
      tutorial
    ],
    profile: { id: 'custom:charla', label: 'Conversación', marker: 'charla' },
    markerChanged: true
  })
  assert.equal(updateCustomScriptProfile([interview, tutorial], interview.id, 'Duplicado', 'tutorial'), undefined)
})
