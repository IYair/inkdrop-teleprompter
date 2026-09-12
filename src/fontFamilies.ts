export interface LocalFontData {
  family: string
  fullName?: string
  postscriptName?: string
  style?: string
}

export interface DeviceFontFamily {
  id: string
  family: string
}

export type FontFamilyId = string

export const DEFAULT_FONT_FAMILY: FontFamilyId = 'app'
const LOCAL_FONT_PREFIX = 'local:'

const cleanFamilyName = (value: string): string => value.trim().replace(/\s+/g, ' ')

export const makeLocalFontId = (family: string): FontFamilyId =>
  `${LOCAL_FONT_PREFIX}${cleanFamilyName(family)}`

export const getLocalFontFamily = (id: FontFamilyId): string | null =>
  id.startsWith(LOCAL_FONT_PREFIX) ? cleanFamilyName(id.slice(LOCAL_FONT_PREFIX.length)) || null : null

export const normalizeFontFamily = (value: unknown): FontFamilyId => {
  if (value === DEFAULT_FONT_FAMILY) return DEFAULT_FONT_FAMILY
  if (typeof value !== 'string') return DEFAULT_FONT_FAMILY
  const family = getLocalFontFamily(value)
  return family ? makeLocalFontId(family) : DEFAULT_FONT_FAMILY
}

export const getFontFamilyCss = (id: FontFamilyId): string => {
  const family = getLocalFontFamily(id)
  if (!family) return 'inherit'
  return `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export const collectDeviceFontFamilies = (fonts: readonly LocalFontData[]): DeviceFontFamily[] => {
  const unique = new Map<string, string>()
  for (const font of fonts) {
    const family = cleanFamilyName(font.family || '')
    if (!family) continue
    const key = family.toLocaleLowerCase()
    if (!unique.has(key)) unique.set(key, family)
  }
  return [...unique.values()]
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    .map(family => ({ id: makeLocalFontId(family), family }))
}

export const queryDeviceFontFamilies = async (): Promise<DeviceFontFamily[]> => {
  const queryLocalFonts = (window as Window & {
    queryLocalFonts?: () => Promise<LocalFontData[]>
  }).queryLocalFonts
  if (!queryLocalFonts) throw new Error('La biblioteca de fuentes no está disponible en esta versión de Inkdrop.')
  return collectDeviceFontFamilies(await queryLocalFonts.call(window))
}
