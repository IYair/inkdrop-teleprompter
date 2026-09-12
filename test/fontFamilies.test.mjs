import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FONT_FAMILY,
  collectDeviceFontFamilies,
  getFontFamilyCss,
  getLocalFontFamily,
  makeLocalFontId,
  normalizeFontFamily
} from '../src/fontFamilies.ts'

test('uses Inkdrop font inheritance by default', () => {
  assert.equal(DEFAULT_FONT_FAMILY, 'app')
  assert.equal(normalizeFontFamily(undefined), 'app')
  assert.equal(normalizeFontFamily('serif'), 'app')
  assert.equal(getFontFamilyCss('app'), 'inherit')
})

test('creates safe persistent values and CSS from a device font family', () => {
  const id = makeLocalFontId('  Test "Display"  ')
  assert.equal(id, 'local:Test "Display"')
  assert.equal(getLocalFontFamily(id), 'Test "Display"')
  assert.equal(getFontFamilyCss(id), '"Test \\"Display\\""')
  assert.equal(normalizeFontFamily(id), id)
})

test('deduplicates and alphabetizes families returned by the device library', () => {
  assert.deepEqual(collectDeviceFontFamilies([
    { family: 'Zed Sans', style: 'Bold' },
    { family: 'alpha Serif', style: 'Regular' },
    { family: 'Zed Sans', style: 'Regular' },
    { family: '  Alpha Serif  ', style: 'Italic' },
    { family: '' }
  ]), [
    { id: 'local:alpha Serif', family: 'alpha Serif' },
    { id: 'local:Zed Sans', family: 'Zed Sans' }
  ])
})
