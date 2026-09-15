export const CUSTOM_PROFILES_STORAGE_KEY = 'inkdrop-teleprompter:custom-script-profiles'
export const HIDDEN_PROFILES_STORAGE_KEY = 'inkdrop-teleprompter:hidden-script-profiles'

export type RemovableBuiltInProfileId = 'keypoints' | 'clean'

export interface CustomScriptProfile {
  id: `custom:${string}`
  label: string
  marker: string
}

export interface BuiltInScriptProfile {
  id: RemovableBuiltInProfileId
  label: string
  description: string
}

export interface CustomScriptProfileUpdate {
  profiles: CustomScriptProfile[]
  profile: CustomScriptProfile
  markerChanged: boolean
}

export const builtInScriptProfiles: BuiltInScriptProfile[] = [
  { id: 'keypoints', label: 'Puntos clave', description: 'Guías breves para hablar con libertad.' },
  { id: 'clean', label: 'Nota limpia', description: 'Toda la nota sin formato Markdown.' }
]

const MAX_CUSTOM_PROFILES = 20
const RESERVED_MARKERS = new Set(['auto', 'key-points', 'puntos-clave', 'clean'])

export function isVisibleScriptProfile(
  id: string,
  custom: boolean,
  hiddenProfiles: RemovableBuiltInProfileId[]
): boolean {
  if (id === 'auto' || custom) return true
  const builtIn = builtInScriptProfiles.find(profile => profile.id === id)
  return Boolean(builtIn && !hiddenProfiles.includes(builtIn.id))
}

export function normalizeProfileMarker(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function createCustomScriptProfile(label: string, requestedMarker = label): CustomScriptProfile | undefined {
  const cleanLabel = label.replace(/\s+/g, ' ').trim().slice(0, 36)
  const marker = normalizeProfileMarker(requestedMarker)
  if (!cleanLabel || !marker || RESERVED_MARKERS.has(marker)) return undefined
  return { id: `custom:${marker}`, label: cleanLabel, marker }
}

function decodeStoredArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function parseCustomScriptProfiles(value: unknown): CustomScriptProfile[] {
  const profiles: CustomScriptProfile[] = []
  const markers = new Set<string>()
  for (const item of decodeStoredArray(value)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const profile = createCustomScriptProfile(
      typeof record.label === 'string' ? record.label : '',
      typeof record.marker === 'string' ? record.marker : ''
    )
    if (!profile || markers.has(profile.marker)) continue
    markers.add(profile.marker)
    profiles.push(profile)
    if (profiles.length >= MAX_CUSTOM_PROFILES) break
  }
  return profiles
}

export function serializeCustomScriptProfiles(profiles: CustomScriptProfile[]): string {
  return JSON.stringify(profiles.map(({ label, marker }) => ({ label, marker })))
}

export function updateCustomScriptProfile(
  profiles: CustomScriptProfile[],
  currentId: CustomScriptProfile['id'],
  label: string,
  marker: string
): CustomScriptProfileUpdate | undefined {
  const current = profiles.find(profile => profile.id === currentId)
  const updated = createCustomScriptProfile(label, marker)
  if (!current || !updated || profiles.some(profile => profile.id !== currentId && profile.marker === updated.marker)) {
    return undefined
  }
  return {
    profiles: profiles.map(profile => profile.id === currentId ? updated : profile),
    profile: updated,
    markerChanged: current.marker !== updated.marker
  }
}

export function parseHiddenScriptProfiles(value: unknown): RemovableBuiltInProfileId[] {
  const allowed = new Set<RemovableBuiltInProfileId>(builtInScriptProfiles.map(profile => profile.id))
  return [...new Set(decodeStoredArray(value).filter(
    (id): id is RemovableBuiltInProfileId => typeof id === 'string' && allowed.has(id as RemovableBuiltInProfileId)
  ))]
}

export function serializeHiddenScriptProfiles(profiles: RemovableBuiltInProfileId[]): string {
  return JSON.stringify(parseHiddenScriptProfiles(profiles))
}

export function getCustomProfileMarkers(marker: string): { start: string; end: string; template: string } {
  const normalized = normalizeProfileMarker(marker)
  const start = `<!-- teleprompter:profile:${normalized} -->`
  const end = `<!-- /teleprompter:profile:${normalized} -->`
  return { start, end, template: `${start}\n\n${end}` }
}
