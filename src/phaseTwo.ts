export interface PendingSecondWindow {
  noteId?: string
  sourceWindowId?: string
  createdAt?: number
}

export interface ScriptSnapshot {
  _id?: string
  title?: string
  body?: string
}

export interface PendingDedicatedWindow {
  snapshot?: ScriptSnapshot
  sourceWindowId?: string
  createdAt?: number
}

export function formatDuration(wordCount: number, speedWpm: number): string {
  const totalSeconds = Math.round((wordCount / Math.max(1, speedWpm)) * 60)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function moveBlock(current: number, direction: -1 | 1, total: number): number {
  return Math.min(Math.max(0, total - 1), Math.max(0, current + direction))
}

export function isPendingForWindow(
  pending: PendingSecondWindow,
  noteId: string,
  currentWindowId: string,
  now = Date.now()
): boolean {
  const isFresh = typeof pending.createdAt === 'number' && now - pending.createdAt < 15000
  return isFresh && pending.noteId === noteId && pending.sourceWindowId !== currentWindowId
}

export function getDedicatedSnapshot(
  pending: PendingDedicatedWindow,
  currentWindowId: string,
  now = Date.now()
): ScriptSnapshot | undefined {
  const isFresh = typeof pending.createdAt === 'number' && now - pending.createdAt < 15000
  if (!isFresh || pending.sourceWindowId === currentWindowId) return undefined
  return pending.snapshot?.body !== undefined ? pending.snapshot : undefined
}
