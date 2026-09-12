export type ProfileId = 'youtube' | 'reel' | 'presentation'

export interface TeleprompterProfile {
  id: ProfileId
  label: string
  speedWpm: number
  fontSize: number
  countdown: number
}

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

export const profiles: TeleprompterProfile[] = [
  { id: 'youtube', label: 'YouTube largo', speedWpm: 135, fontSize: 60, countdown: 3 },
  { id: 'reel', label: 'Reel / TikTok', speedWpm: 150, fontSize: 54, countdown: 3 },
  { id: 'presentation', label: 'Presentación', speedWpm: 115, fontSize: 48, countdown: 5 }
]

export function getProfile(id: ProfileId): TeleprompterProfile {
  return profiles.find(profile => profile.id === id) || profiles[0]
}

export function findMatchingProfile(settings: Omit<TeleprompterProfile, 'id' | 'label'>): ProfileId | 'custom' {
  return profiles.find(profile =>
    profile.speedWpm === settings.speedWpm &&
    profile.fontSize === settings.fontSize &&
    profile.countdown === settings.countdown
  )?.id || 'custom'
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
