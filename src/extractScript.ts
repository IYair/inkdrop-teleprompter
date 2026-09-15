import { getCustomProfileMarkers, type CustomScriptProfile } from './scriptProfiles.ts'

export type BuiltInScriptMode = 'auto' | 'youtube' | 'reel' | 'keypoints' | 'clean'
export type ScriptMode = BuiltInScriptMode | `custom:${string}`
export type ScriptLanguage = 'es' | 'en'

export interface ScriptOption {
  id: ScriptMode
  label: string
  text: string
  custom?: boolean
  marker?: string
}

interface SectionMarker {
  starts: RegExp[]
  ends: RegExp[]
}

const YOUTUBE_HEADING = /^#{1,6}\s+.*(?:(?:gui[oó]n|script).*youtube|youtube.*(?:gui[oó]n|script)).*$/im
const REEL_HEADING = /^#{1,6}\s+.*(?:(?:adaptaci[oó]n|adaptation|gui[oó]n|script).*(?:tiktok|reels?|shorts?)|(?:tiktok|reels?|shorts?).*(?:adaptaci[oó]n|adaptation|gui[oó]n|script)).*$/im
const KEY_POINTS_HEADING = /^#{1,6}\s+.*(?:puntos?\s+clave|key\s+points?|talking\s+points?).*$/im
const KEY_POINTS_START = /^\s*<!--\s*teleprompter:(?:key-points|puntos-clave)\s*-->\s*$/im
const KEY_POINTS_END = /^\s*<!--\s*\/teleprompter:(?:key-points|puntos-clave)\s*-->\s*$/im
const CUSTOM_PROFILE_START = /^\s*<!--\s*teleprompter:profile:[a-z0-9-]+\s*-->\s*$/im
const AUXILIARY_HEADING = /^#{1,6}\s+(?:plan(?:\s+de\s+producci[oó]n|\s+of\s+production)?|production\s+plan|notas?|notes?|pr[oó]ximos\s+pasos?|next\s+steps?|checklist)\b.*$/im

const SECTION_MARKERS: Record<'youtube' | 'reel' | 'keypoints', SectionMarker> = {
  youtube: {
    starts: [YOUTUBE_HEADING],
    ends: [REEL_HEADING, KEY_POINTS_START, KEY_POINTS_HEADING, CUSTOM_PROFILE_START, AUXILIARY_HEADING]
  },
  reel: {
    starts: [REEL_HEADING],
    ends: [KEY_POINTS_START, KEY_POINTS_HEADING, CUSTOM_PROFILE_START, AUXILIARY_HEADING]
  },
  keypoints: {
    starts: [KEY_POINTS_START, KEY_POINTS_HEADING],
    ends: [KEY_POINTS_END, CUSTOM_PROFILE_START, AUXILIARY_HEADING]
  }
}

interface MarkerMatch {
  index: number
  length: number
}

function findFirstMarker(markdown: string, markers: RegExp[]): MarkerMatch | undefined {
  let first: MarkerMatch | undefined
  for (const marker of markers) {
    const match = markdown.match(marker)
    if (match?.index === undefined) continue
    if (!first || match.index < first.index) first = { index: match.index, length: match[0].length }
  }
  return first
}

function sliceSection(markdown: string, marker: SectionMarker): string {
  const start = findFirstMarker(markdown, marker.starts)
  if (!start) return ''
  const remainder = markdown.slice(start.index + start.length)
  const end = findFirstMarker(remainder, marker.ends)
  return end ? remainder.slice(0, end.index) : remainder
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<https?:\/\/[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSpokenText(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const spoken: string[] = []
  let capture = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const boldLabel = line.match(/^\*\*([^*]+)\*\*\s*:?[ \t]*(.*)$/)
    if (boldLabel) {
      const label = boldLabel[1].trim()
      const inline = boldLabel[2].trim()
      const isVoice = /(?:voz|di[aá]logo|narraci[oó]n|locuci[oó]n|voice(?:over)?|voice-over|dialogue|dialog|narration|spoken)/i.test(label)
      const isTimedBeat = /^\d{1,2}\s*[–—-]\s*\d{1,2}\s*s\b/i.test(label)
      const isNonSpoken = /(?:visual|texto en pantalla|on-?screen text|b-?roll|edici[oó]n|editing|toma|shot|plano|camera|m[uú]sica|music|sonido|sound)/i.test(label)

      capture = isVoice || (isTimedBeat && !isNonSpoken)
      if (capture && inline) spoken.push(stripInlineMarkdown(inline))
      continue
    }

    if (/^#{1,6}\s+/.test(line)) {
      capture = false
      continue
    }

    if (capture || /^>/.test(line) || /^[“\"]/.test(line)) {
      const cleaned = stripInlineMarkdown(line)
      if (cleaned) spoken.push(cleaned)
    }
  }

  return spoken.join('\n\n')
}

function extractKeyPoints(markdown: string): string {
  const output: string[] = []
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || /^<!--/.test(line) || /^>/.test(line)) continue
    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      const label = stripInlineMarkdown(heading[1])
      if (label && !/(?:puntos?\s+clave|key\s+points?|talking\s+points?)/i.test(label)) output.push(label)
      continue
    }
    if (/^\s*[-+*]\s+\[[ xX]\]\s+/.test(rawLine)) continue
    const cleaned = stripInlineMarkdown(line)
    if (cleaned) output.push(cleaned)
  }
  return output.join('\n\n')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractGenericSection(markdown: string): string {
  const output: string[] = []
  for (const rawLine of markdown.split(/\r?\n/)) {
    if (!rawLine.trim() || /^\s*<!--/.test(rawLine) || /^\s*-\s+\[[ xX]\]\s+/.test(rawLine)) continue
    const heading = rawLine.match(/^#{1,6}\s+(.+)$/)
    const cleaned = stripInlineMarkdown(heading ? heading[1] : rawLine)
    if (cleaned) output.push(cleaned)
  }
  return output.join('\n\n')
}

function extractCustomProfile(markdown: string, profile: CustomScriptProfile): string {
  const markers = getCustomProfileMarkers(profile.marker)
  const escapedStart = escapeRegExp(markers.start)
  const escapedEnd = escapeRegExp(markers.end)
  const section = sliceSection(markdown, {
    starts: [new RegExp(`^\\s*${escapedStart}\\s*$`, 'im')],
    ends: [new RegExp(`^\\s*${escapedEnd}\\s*$`, 'im'), CUSTOM_PROFILE_START]
  })
  const spoken = extractSpokenText(section)
  return spoken || extractGenericSection(section)
}

export function cleanMarkdown(markdown: string): string {
  const withoutFrontmatter = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
  const lines = withoutFrontmatter.split(/\r?\n/)
  const output: string[] = []
  let skipSection = false

  for (const rawLine of lines) {
    if (/^\s*<!--/.test(rawLine)) continue
    const heading = rawLine.match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      skipSection = /^(?:plan(?:\s+de\s+producci[oó]n|\s+of\s+production)?|production\s+plan|notas?|notes?|pr[oó]ximos\s+pasos?|next\s+steps?|checklist)\b/i.test(
        stripInlineMarkdown(heading[1])
      )
      if (!skipSection) output.push(stripInlineMarkdown(heading[1]))
      continue
    }
    if (skipSection || /^\s*-\s+\[[ xX]\]\s+/.test(rawLine)) continue
    const cleaned = stripInlineMarkdown(rawLine)
    if (cleaned) output.push(cleaned)
  }

  return output.join('\n\n')
}

export function detectScriptLanguage(text: string): ScriptLanguage {
  const words = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/\p{L}+/gu) || []
  const spanish = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'y', 'de', 'en', 'es', 'para', 'con', 'que', 'este', 'esta', 'como', 'por', 'mi', 'mis'])
  const english = new Set(['the', 'a', 'an', 'and', 'of', 'in', 'is', 'are', 'for', 'with', 'that', 'this', 'as', 'by', 'my', 'our', 'your'])
  const score = words.reduce((result, word) => {
    if (spanish.has(word)) result.es++
    if (english.has(word)) result.en++
    return result
  }, { es: 0, en: 0 })
  return score.en > score.es ? 'en' : 'es'
}

export function getScriptOptions(markdown: string, customProfiles: CustomScriptProfile[] = []): ScriptOption[] {
  const youtubeSection = sliceSection(markdown, SECTION_MARKERS.youtube)
  const reelSection = sliceSection(markdown, SECTION_MARKERS.reel)
  const keyPointsSection = sliceSection(markdown, SECTION_MARKERS.keypoints)
  const youtube = extractSpokenText(youtubeSection)
  const reel = extractSpokenText(reelSection)
  const keypoints = extractKeyPoints(keyPointsSection)
  const clean = cleanMarkdown(markdown)
  const auto = youtube || reel || keypoints || clean
  const custom = customProfiles.map(profile => ({
    id: profile.id,
    label: profile.label,
    text: extractCustomProfile(markdown, profile),
    custom: true,
    marker: profile.marker
  } satisfies ScriptOption))

  return [
    { id: 'auto', label: 'Automático', text: auto },
    { id: 'youtube', label: 'YouTube', text: youtube },
    { id: 'reel', label: 'Reel / TikTok', text: reel },
    { id: 'keypoints', label: 'Puntos clave', text: keypoints },
    ...custom,
    { id: 'clean', label: 'Nota limpia', text: clean }
  ]
}
