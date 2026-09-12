export interface ScriptPhrase {
  text: string
  paragraph: number
  startWord: number
  endWord: number
}

export function normalizeWords(text: string): string[] {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []
}

export function indexScript(paragraphs: string[]) {
  const words: string[] = []
  const phrases: ScriptPhrase[] = []
  for (const [paragraph, text] of paragraphs.entries()) {
    // Keep the original punctuation/spacing for display; accents are normalized only for matching.
    const segments = text.match(/[^.!?;…]+(?:[.!?;…]+[»”"']*\s*|$)|[.!?;…]+\s*/gu) || [text]
    for (const segment of segments) {
      const tokens = normalizeWords(segment)
      if (!tokens.length) {
        if (phrases.at(-1)?.paragraph === paragraph) phrases[phrases.length - 1].text += segment
        continue
      }
      const startWord = words.length
      words.push(...tokens)
      phrases.push({ text: segment, paragraph, startWord, endWord: words.length - 1 })
    }
  }
  return { words, phrases }
}

function wordCost(a: string, b: string): number {
  if (a === b) return 0
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return 1
  // A single character error is common in names and inflections.
  let i = 0, j = 0, errors = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++errors > 1) return 1
    if (a.length >= b.length) i++
    if (b.length >= a.length) j++
  }
  return errors + (a.length - i) + (b.length - j) <= 1 ? 0.35 : 1
}

export class VoiceTracker {
  private cursor = -1
  private previousTranscript = ''
  readonly script: ReturnType<typeof indexScript>

  constructor(paragraphs: string[]) { this.script = indexScript(paragraphs) }

  seekPhrase(index: number): void {
    this.cursor = (this.script.phrases[index]?.startWord || 0) - 1
    this.previousTranscript = ''
  }

  match(transcript: string): { phrase: number; word: number } | null {
    const query = normalizeWords(transcript).slice(-12)
    const signature = query.join(' ')
    if (signature === this.previousTranscript) return null
    this.previousTranscript = signature
    if (query.length < 3 || query.filter(word => word.length > 3).length < 2) return null
    const start = Math.max(0, this.cursor - 24)
    const end = Math.min(this.script.words.length, Math.max(0, this.cursor) + 100)
    const candidates = this.script.words.slice(start, end)
    // Semi-global edit distance: match the spoken suffix anywhere near the reading position.
    let row = new Array<number>(candidates.length + 1).fill(0)
    for (let i = 1; i <= query.length; i++) {
      const next = [i]
      for (let j = 1; j <= candidates.length; j++) {
        next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + wordCost(query[i - 1], candidates[j - 1]))
      }
      row = next
    }
    let bestWord = -1
    let bestScore = Number.POSITIVE_INFINITY
    for (let j = 1; j <= candidates.length; j++) {
      if (wordCost(query[query.length - 1], candidates[j - 1]) > 0.35) continue
      if (row[j] > Math.min(2.5, query.length * 0.26)) continue
      const word = start + j - 1
      const score = row[j] + Math.abs(word - this.cursor) * 0.002
      if (score < bestScore) { bestScore = score; bestWord = word }
    }
    if (bestWord < 0) return null
    this.cursor = bestWord
    const phrase = this.script.phrases.findIndex(item => bestWord >= item.startWord && bestWord <= item.endWord)
    return phrase < 0 ? null : { phrase, word: bestWord }
  }
}
