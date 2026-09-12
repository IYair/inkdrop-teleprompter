export type ScriptMode = 'auto' | 'youtube' | 'reel' | 'clean'

export interface ScriptOption {
  id: ScriptMode
  label: string
  text: string
}

const SECTION_MARKERS = {
  youtube: /^#{1,6}\s+.*(?:guion.*youtube|youtube.*guion).*$/im,
  reel: /^#{1,6}\s+.*(?:adaptaci[oó]n.*(?:tiktok|reel)|(?:tiktok|reel).*(?:adaptaci[oó]n|guion)).*$/im
}

function sliceSection(markdown: string, start: RegExp, end?: RegExp): string {
  const startMatch = markdown.match(start)
  if (!startMatch || startMatch.index === undefined) return ''
  const contentStart = startMatch.index + startMatch[0].length
  const remainder = markdown.slice(contentStart)
  if (!end) return remainder
  const endMatch = remainder.match(end)
  return endMatch?.index === undefined ? remainder : remainder.slice(0, endMatch.index)
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
      const isVoice = /(?:voz|di[aá]logo|narraci[oó]n|locuci[oó]n)/i.test(label)
      const isTimedBeat = /^\d{1,2}\s*[–—-]\s*\d{1,2}\s*s\b/i.test(label)
      const isNonSpoken = /(?:visual|texto en pantalla|b-?roll|edici[oó]n|toma|plano|m[uú]sica|sonido)/i.test(label)

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

export function cleanMarkdown(markdown: string): string {
  const withoutFrontmatter = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
  const lines = withoutFrontmatter.split(/\r?\n/)
  const output: string[] = []
  let skipSection = false

  for (const rawLine of lines) {
    const heading = rawLine.match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      skipSection = /^(?:plan(?: de producci[oó]n)?|notas?|pr[oó]ximos pasos?|checklist)\b/i.test(
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

export function getScriptOptions(markdown: string): ScriptOption[] {
  const youtubeSection = sliceSection(markdown, SECTION_MARKERS.youtube, SECTION_MARKERS.reel)
  const reelSection = sliceSection(markdown, SECTION_MARKERS.reel, /^#{1,6}\s+(?:plan|notas?|pr[oó]ximos)/im)
  const youtube = extractSpokenText(youtubeSection)
  const reel = extractSpokenText(reelSection)
  const clean = cleanMarkdown(markdown)
  const auto = youtube || reel || clean

  return [
    { id: 'auto', label: 'Automático', text: auto },
    { id: 'youtube', label: 'YouTube', text: youtube },
    { id: 'reel', label: 'Reel / TikTok', text: reel },
    { id: 'clean', label: 'Nota limpia', text: clean }
  ]
}
