import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { useModal } from 'inkdrop'
import type { ButtonProps, Dialog as DialogClass } from '@inkdropapp/types'
import { getEnv } from './env'
import { detectScriptLanguage, getScriptOptions, type ScriptMode } from './extractScript'
import { ScrollEngine } from './scrollEngine'
import { VoiceTracker } from './voiceTracking'
import { NativeVoice } from './nativeVoice'
import {
  type DeviceFontFamily,
  getLocalFontFamily,
  getFontFamilyCss,
  normalizeFontFamily,
  queryDeviceFontFamilies,
  type FontFamilyId
} from './fontFamilies'
import {
  formatDuration,
  getDedicatedSnapshot,
  moveBlock
} from './phaseTwo'
import {
  builtInScriptProfiles,
  createCustomScriptProfile,
  CUSTOM_PROFILES_STORAGE_KEY,
  getCustomProfileMarkers,
  HIDDEN_PROFILES_STORAGE_KEY,
  isVisibleScriptProfile,
  normalizeProfileMarker,
  parseCustomScriptProfiles,
  parseHiddenScriptProfiles,
  serializeCustomScriptProfiles,
  serializeHiddenScriptProfiles,
  updateCustomScriptProfile,
  type CustomScriptProfile,
  type RemovableBuiltInProfileId
} from './scriptProfiles'

interface EditingNote {
  _id?: string
  title?: string
  body?: string
}

const SECOND_WINDOW_KEY = 'inkdrop-teleprompter:pending-window'
const CURRENT_WINDOW_ID = new URLSearchParams(window.location.search).get('windowId') || 'unknown'
const IS_MACOS = navigator.platform.toLowerCase().startsWith('mac')
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const TeleprompterDialog: React.FC = () => {
  const modal = useModal()
  const Dialog = getEnv().components.getComponentClass('Dialog') as DialogClass
  const Button = getEnv().components.getComponentClass<ButtonProps>('Button') as React.FC<ButtonProps>
  const editingNote = useSelector((state: any) => state.editingNote) as EditingNote | undefined
  const viewportRef = useRef<HTMLDivElement>(null)
  const scriptRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const voiceRef = useRef<NativeVoice | null>(null)
  const voiceCallbacksRef = useRef({ onText: (_text: string) => undefined as void })
  const [followVoice, setFollowVoice] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('Pulsa Play y lee el guion en español')
  const [activePhrase, setActivePhrase] = useState<number | null>(null)
  const [voiceWord, setVoiceWord] = useState(-1)
  const countdownTimerRef = useRef<number | null>(null)
  const settingsRef = useRef({ speedWpm: 135, fontSize: 60 })
  const initialSettingsRef = useRef<{
    speedWpm: number
    fontSize: number
    countdown: number
  } | null>(null)
  if (!initialSettingsRef.current) {
    const savedCountdown = Number(getEnv().config.get('inkdrop-teleprompter.countdown'))
    initialSettingsRef.current = {
      speedWpm: Number(getEnv().config.get('inkdrop-teleprompter.speedWpm')) || 135,
      fontSize: Number(getEnv().config.get('inkdrop-teleprompter.fontSize')) || 60,
      countdown: Number.isFinite(savedCountdown) ? savedCountdown : 3
    }
  }
  const initialSettings = initialSettingsRef.current
  const scrollEngineRef = useRef<ScrollEngine | null>(null)
  const [snapshot, setSnapshot] = useState<EditingNote>({})
  const [dedicated, setDedicated] = useState(false)
  const [mode, setMode] = useState<ScriptMode>('auto')
  const [customScriptProfiles, setCustomScriptProfiles] = useState<CustomScriptProfile[]>(() =>
    parseCustomScriptProfiles(window.localStorage.getItem(CUSTOM_PROFILES_STORAGE_KEY)))
  const [hiddenScriptProfiles, setHiddenScriptProfiles] = useState<RemovableBuiltInProfileId[]>(() =>
    parseHiddenScriptProfiles(window.localStorage.getItem(HIDDEN_PROFILES_STORAGE_KEY)))
  const [profileManagerOpen, setProfileManagerOpen] = useState(false)
  const [draftProfileLabel, setDraftProfileLabel] = useState('')
  const [draftProfileMarker, setDraftProfileMarker] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [lastDeletedProfile, setLastDeletedProfile] = useState<CustomScriptProfile | null>(null)
  const [editingProfileId, setEditingProfileId] = useState<CustomScriptProfile['id'] | null>(null)
  const [editProfileLabel, setEditProfileLabel] = useState('')
  const [editProfileMarker, setEditProfileMarker] = useState('')
  const [playing, setPlaying] = useState(false)
  const [countdownValue, setCountdownValue] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [currentBlock, setCurrentBlock] = useState(0)
  const [controlsHidden, setControlsHidden] = useState(false)
  const [speed, setSpeed] = useState(initialSettings.speedWpm)
  const [fontSize, setFontSize] = useState(initialSettings.fontSize)
  const [fontFamily, setFontFamily] = useState<FontFamilyId>(() =>
    normalizeFontFamily(getEnv().config.get('inkdrop-teleprompter.fontFamily')))
  const [deviceFonts, setDeviceFonts] = useState<DeviceFontFamily[]>([])
  const [fontLibraryStatus, setFontLibraryStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [countdown, setCountdown] = useState(initialSettings.countdown)
  const [mirror, setMirror] = useState(() => Boolean(getEnv().config.get('inkdrop-teleprompter.mirror')))

  settingsRef.current = { speedWpm: speed, fontSize }
  if (!scrollEngineRef.current) {
    scrollEngineRef.current = new ScrollEngine({
      requestFrame: callback => window.requestAnimationFrame(callback),
      cancelFrame: id => window.cancelAnimationFrame(id),
      getTarget: () => viewportRef.current,
      getSettings: () => settingsRef.current,
      onProgress: value => setProgress(value),
      onFinish: () => setPlaying(false)
    })
  }

  const allOptions = useMemo(() => getScriptOptions(snapshot.body || '', customScriptProfiles),
    [customScriptProfiles, snapshot.body])
  const options = useMemo(() => allOptions.filter(option =>
    isVisibleScriptProfile(option.id, Boolean(option.custom), hiddenScriptProfiles)
  ), [allOptions, hiddenScriptProfiles])
  const selected = options.find(option => option.id === mode) || options[0]
  const paragraphs = useMemo(() => selected.text.split(/\n{2,}/).filter(Boolean), [selected.text])
  const tracker = useMemo(() => new VoiceTracker(paragraphs), [paragraphs])
  const wordCount = selected.text.trim() ? selected.text.trim().split(/\s+/).length : 0
  const scriptLanguage = useMemo(() => detectScriptLanguage(selected.text), [selected.text])
  const languageLabel = scriptLanguage === 'en' ? 'Inglés' : 'Español'
  const selectedLocalFont = getLocalFontFamily(fontFamily)

  const loadDeviceFonts = useCallback(async () => {
    if (fontLibraryStatus === 'loading' || fontLibraryStatus === 'loaded') return
    setFontLibraryStatus('loading')
    try {
      const fonts = await queryDeviceFontFamilies()
      setDeviceFonts(fonts)
      setFontLibraryStatus('loaded')
    } catch {
      setFontLibraryStatus('error')
    }
  }, [fontLibraryStatus])

  voiceCallbacksRef.current.onText = text => {
    const match = tracker.match(text)
    if (!match) { setVoiceStatus('Escuchando… esperando coincidencia con el guion'); return }
    setActivePhrase(match.phrase)
    setVoiceWord(match.word)
    setCurrentBlock(tracker.script.phrases[match.phrase].paragraph)
    setVoiceStatus(`Siguiendo tu voz · ${languageLabel} · Local`)
  }

  useEffect(() => {
    if (!followVoice || activePhrase === null) return
    const viewport = viewportRef.current
    const phrase = scriptRef.current?.querySelector<HTMLElement>(`[data-phrase="${activePhrase}"]`)
    if (!viewport || !phrase) return
    // Align the recognized word's line, including within a long multi-line sentence.
    const word = phrase.querySelector<HTMLElement>(`[data-word="${voiceWord}"]`) || phrase
    const bounds = word.getBoundingClientRect()
    const view = viewport.getBoundingClientRect()
    viewport.scrollTo({ top: Math.max(0, viewport.scrollTop + bounds.top - view.top - viewport.clientHeight * 0.35),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [activePhrase, voiceWord, followVoice, fontSize])

  const stopAnimation = useCallback(() => scrollEngineRef.current?.stop(), [])

  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current)
    countdownTimerRef.current = null
    setCountdownValue(null)
  }, [])

  const pause = useCallback(() => {
    voiceRef.current?.stop()
    voiceRef.current = null
    setVoiceStatus('En pausa · Pulsa Play para escuchar')
    stopAnimation()
    cancelCountdown()
    setPlaying(false)
  }, [cancelCountdown, stopAnimation])

  const reset = useCallback(() => {
    pause()
    if (viewportRef.current) viewportRef.current.scrollTop = 0
    setProgress(0)
    setCurrentBlock(0)
    tracker.seekPhrase(0)
    setActivePhrase(null)
    setVoiceWord(-1)
  }, [pause, tracker])

  const beginScroll = useCallback(() => {
    cancelCountdown()
    setPlaying(true)
    if (followVoice) {
      scrollEngineRef.current?.stop()
      setVoiceStatus('Iniciando micrófono…')
      voiceRef.current = new NativeVoice({
        onText: text => voiceCallbacksRef.current.onText(text),
        onStatus: message => setVoiceStatus(message),
        onReady: locale => setVoiceStatus(`Escuchando · ${languageLabel}${locale ? ` (${locale})` : ''} · Lee al menos tres palabras`),
        onError: message => { setPlaying(false); setVoiceStatus(message) }
      }, scriptLanguage)
      voiceRef.current.start()
    } else scrollEngineRef.current?.start()
  }, [cancelCountdown, followVoice, languageLabel, scriptLanguage])

  const play = useCallback(() => {
    if (playing || countdownValue !== null || !selected.text) return
    if (countdown <= 0) {
      beginScroll()
      return
    }
    let remaining = countdown
    setCountdownValue(remaining)
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1
      if (remaining <= 0) beginScroll()
      else setCountdownValue(remaining)
    }, 1000)
  }, [beginScroll, countdown, countdownValue, playing, selected.text])

  const openTeleprompter = useCallback((note: EditingNote | undefined = editingNote) => {
    setSnapshot({
      _id: note?._id,
      title: note?.title || 'Sin título',
      body: note?.body || ''
    })
    setMode('auto')
    setProfileManagerOpen(false)
    setControlsHidden(false)
    setProgress(0)
    setCurrentBlock(0)
    modal.show()
  }, [editingNote, modal])

  const toggle = useCallback(() => {
    if (modal.state.visible) {
      pause()
      if (dedicated) void getEnv().window.close()
      else modal.close()
    } else {
      openTeleprompter()
    }
  }, [dedicated, modal, openTeleprompter, pause])

  const openInSeparateWindow = useCallback(() => {
    if (!editingNote?._id) {
      getEnv().notifications.addError('Teleprompter: abre una nota antes de usar el segundo monitor.')
      return
    }
    pause()
    modal.close()
    window.localStorage.setItem(SECOND_WINDOW_KEY, JSON.stringify({
      snapshot: {
        _id: editingNote._id,
        title: editingNote.title || 'Sin título',
        body: editingNote.body || ''
      },
      sourceWindowId: CURRENT_WINDOW_ID,
      createdAt: Date.now()
    }))
    getEnv().commands.dispatch(document.body, 'core:open-note-in-separate-window', {
      noteId: editingNote._id
    })
  }, [editingNote, modal, pause])

  useEffect(() => {
    const subscription = getEnv().commands.add(document.body, {
      'inkdrop-teleprompter:toggle': toggle,
      'inkdrop-teleprompter:open-window': openInSeparateWindow
    })
    return () => subscription.dispose()
  }, [openInSeparateWindow, toggle])

  useEffect(() => {
    if (modal.state.visible) return
    const raw = window.localStorage.getItem(SECOND_WINDOW_KEY)
    if (!raw) return
    try {
      const pending = JSON.parse(raw) as {
        snapshot?: EditingNote
        sourceWindowId?: string
        createdAt?: number
      }
      const isFresh = typeof pending.createdAt === 'number' && Date.now() - pending.createdAt < 15000
      const pendingSnapshot = getDedicatedSnapshot(pending, CURRENT_WINDOW_ID)
      if (pendingSnapshot) {
        window.localStorage.removeItem(SECOND_WINDOW_KEY)
        setDedicated(true)
        openTeleprompter(pendingSnapshot)
      } else if (!isFresh) {
        window.localStorage.removeItem(SECOND_WINDOW_KEY)
      }
    } catch {
      window.localStorage.removeItem(SECOND_WINDOW_KEY)
    }
  }, [modal.state.visible, openTeleprompter])

  useEffect(() => {
    if (!dedicated) return
    const previousTitle = document.title
    document.body.classList.add('teleprompter-dedicated-window')
    document.title = `Teleprompter — ${snapshot.title || 'Guion'}`
    void getEnv().window.setMinimumSize(360, 240)
    return () => {
      document.body.classList.remove('teleprompter-dedicated-window')
      document.title = previousTitle
    }
  }, [dedicated, snapshot.title])

  useEffect(() => {
    if (!dedicated) return
    const alignToWindow = () => {
      const shell = shellRef.current
      if (!shell) return
      shell.style.transform = ''
      const bounds = shell.getBoundingClientRect()
      shell.style.transform = `translate(${-bounds.left}px, ${-bounds.top}px)`
    }
    const frameId = window.requestAnimationFrame(alignToWindow)
    window.addEventListener('resize', alignToWindow)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', alignToWindow)
    }
  }, [dedicated])

  const goToBlock = useCallback((direction: -1 | 1) => {
    if (!paragraphs.length) return
    pause()
    const next = moveBlock(currentBlock, direction, paragraphs.length)
    const element = scriptRef.current?.children.item(next) as HTMLElement | null
    const viewport = viewportRef.current
    if (element && viewport) {
      viewport.scrollTop = Math.max(0, element.offsetTop - viewport.clientHeight * 0.43)
    }
    setCurrentBlock(next)
    const phrase = tracker.script.phrases.findIndex(item => item.paragraph === next)
    tracker.seekPhrase(Math.max(0, phrase))
    setActivePhrase(null)
    setVoiceWord(-1)
  }, [currentBlock, paragraphs.length, pause, tracker])

  useEffect(() => {
    if (!modal.state.visible) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (profileManagerOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setProfileManagerOpen(false)
        }
        return
      }
      if (/INPUT|SELECT/.test(target.tagName)) return
      if (event.code === 'Space') {
        event.preventDefault()
        playing || countdownValue !== null ? pause() : play()
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSpeed(value => clamp(value + 5, 60, 240))
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSpeed(value => clamp(value - 5, 60, 240))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToBlock(-1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToBlock(1)
      } else if (event.key.toLowerCase() === 'r') reset()
      else if (event.key.toLowerCase() === 'm') setMirror(value => !value)
      else if (event.key === 'Escape') toggle()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [countdownValue, goToBlock, modal.state.visible, pause, play, playing, profileManagerOpen, reset, toggle])

  useEffect(() => { getEnv().config.set('inkdrop-teleprompter.speedWpm', speed) }, [speed])
  useEffect(() => { getEnv().config.set('inkdrop-teleprompter.fontSize', fontSize) }, [fontSize])
  useEffect(() => { getEnv().config.set('inkdrop-teleprompter.fontFamily', fontFamily) }, [fontFamily])
  useEffect(() => { getEnv().config.set('inkdrop-teleprompter.countdown', countdown) }, [countdown])
  useEffect(() => { getEnv().config.set('inkdrop-teleprompter.mirror', mirror) }, [mirror])
  useEffect(() => {
    window.localStorage.setItem(CUSTOM_PROFILES_STORAGE_KEY, serializeCustomScriptProfiles(customScriptProfiles))
  }, [customScriptProfiles])
  useEffect(() => {
    window.localStorage.setItem(HIDDEN_PROFILES_STORAGE_KEY, serializeHiddenScriptProfiles(hiddenScriptProfiles))
  }, [hiddenScriptProfiles])
  useEffect(() => {
    if (!options.some(option => option.id === mode)) setMode('auto')
  }, [mode, options])
  useEffect(() => () => {
    voiceRef.current?.stop()
    stopAnimation()
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current)
  }, [stopAnimation])

  const handleScroll = () => {
    const viewport = viewportRef.current
    const script = scriptRef.current
    if (!viewport || !script) return
    const maxScroll = Math.max(1, viewport.scrollHeight - viewport.clientHeight)
    setProgress(clamp(viewport.scrollTop / maxScroll, 0, 1))
    if (followVoice) return
    const focusPoint = viewport.scrollTop + viewport.clientHeight * 0.43
    let nearest = 0
    let distance = Number.POSITIVE_INFINITY
    Array.from(script.children).forEach((child, index) => {
      const element = child as HTMLElement
      const nextDistance = Math.abs(element.offsetTop + element.offsetHeight / 2 - focusPoint)
      if (nextDistance < distance) {
        distance = nextDistance
        nearest = index
      }
    })
    setCurrentBlock(nearest)
  }

  const changeMode = (nextMode: ScriptMode) => {
    setMode(nextMode)
    reset()
  }

  const toggleBuiltInScriptProfile = (id: RemovableBuiltInProfileId) => {
    const isHidden = hiddenScriptProfiles.includes(id)
    setHiddenScriptProfiles(current => isHidden ? current.filter(item => item !== id) : [...current, id])
    if (!isHidden && mode === id) {
      setMode('auto')
      reset()
    }
    setProfileMessage(isHidden ? 'Perfil restaurado.' : 'Perfil quitado. Puedes restaurarlo cuando quieras.')
  }

  const deleteCustomScriptProfile = (item: CustomScriptProfile) => {
    setCustomScriptProfiles(current => current.filter(profile => profile.id !== item.id))
    setLastDeletedProfile(item)
    if (editingProfileId === item.id) setEditingProfileId(null)
    if (mode === item.id) {
      setMode('auto')
      reset()
    }
    setProfileMessage(`“${item.label}” fue eliminado.`)
  }

  const undoDeleteCustomProfile = () => {
    if (!lastDeletedProfile) return
    setCustomScriptProfiles(current => current.some(item => item.marker === lastDeletedProfile.marker)
      ? current : [...current, lastDeletedProfile])
    setProfileMessage(`“${lastDeletedProfile.label}” fue restaurado.`)
    setLastDeletedProfile(null)
  }

  const createScriptProfile = (event: React.FormEvent) => {
    event.preventDefault()
    const next = createCustomScriptProfile(draftProfileLabel, draftProfileMarker)
    if (!next) {
      setProfileMessage('Escribe un nombre y un marcador único. Evita los nombres reservados.')
      return
    }
    if (customScriptProfiles.some(item => item.marker === next.marker)) {
      setProfileMessage('Ese marcador ya pertenece a otro perfil.')
      return
    }
    if (customScriptProfiles.length >= 20) {
      setProfileMessage('Puedes guardar hasta 20 perfiles personalizados.')
      return
    }
    setCustomScriptProfiles(current => [...current, next])
    setDraftProfileLabel('')
    setDraftProfileMarker('')
    setLastDeletedProfile(null)
    setProfileMessage(`“${next.label}” está listo. Copia su marcador y colócalo en tu nota.`)
  }

  const copyCustomProfileMarkers = async (item: CustomScriptProfile) => {
    try {
      await navigator.clipboard.writeText(getCustomProfileMarkers(item.marker).template)
      setProfileMessage(`Marcadores de “${item.label}” copiados.`)
    } catch {
      setProfileMessage('No se pudo copiar. Selecciona el marcador mostrado e inténtalo de nuevo.')
    }
  }

  const startEditingScriptProfile = (item: CustomScriptProfile) => {
    setEditingProfileId(item.id)
    setEditProfileLabel(item.label)
    setEditProfileMarker(item.marker)
    setProfileMessage('')
  }

  const cancelEditingScriptProfile = () => {
    setEditingProfileId(null)
    setEditProfileLabel('')
    setEditProfileMarker('')
  }

  const saveEditedScriptProfile = (event: React.FormEvent, currentProfile: CustomScriptProfile) => {
    event.preventDefault()
    const result = updateCustomScriptProfile(
      customScriptProfiles, currentProfile.id, editProfileLabel, editProfileMarker)
    if (!result) {
      setProfileMessage('Usa un nombre y un marcador válidos que no pertenezcan a otro perfil.')
      return
    }
    setCustomScriptProfiles(result.profiles)
    if (mode === currentProfile.id) {
      setMode(result.profile.id)
      reset()
    }
    cancelEditingScriptProfile()
    setLastDeletedProfile(null)
    setProfileMessage(result.markerChanged
      ? `“${result.profile.label}” fue actualizado. Cambia también el marcador en las notas que usaban “${currentProfile.marker}”.`
      : `“${result.profile.label}” fue actualizado.`)
  }

  const choosePhrase = (index: number) => {
    pause()
    tracker.seekPhrase(index)
    setActivePhrase(index)
    setVoiceWord(tracker.script.phrases[index].startWord)
    setCurrentBlock(tracker.script.phrases[index].paragraph)
    setVoiceStatus('Punto de lectura elegido · Pulsa Play para retomar')
  }

  const teleprompter = (
    <div ref={shellRef} className={`teleprompter-shell ${dedicated ? 'is-dedicated' : ''} ${IS_MACOS ? 'is-macos' : ''} ${controlsHidden ? 'controls-hidden' : ''}`}>
        <header className="teleprompter-topbar">
          <div className="teleprompter-brand">
            <span className={`teleprompter-rec-dot ${playing ? 'is-live' : ''}`} />
            <div>
              <span className="teleprompter-kicker">TELEPROMPTER</span>
              <strong>{snapshot.title || 'Sin título'}</strong>
            </div>
          </div>
          <div className="teleprompter-profile-strip">
            <div className="teleprompter-mode-tabs" role="tablist" aria-label="Versión del guion / Script version">
              {options.map(option => (
                <button key={option.id} className={mode === option.id ? 'is-active' : ''}
                  disabled={!option.text && !option.custom} onClick={() => changeMode(option.id)}
                  role="tab" aria-selected={mode === option.id}>
                  {option.label}
                </button>
              ))}
            </div>
            <button className={`teleprompter-manage-profiles ${profileManagerOpen ? 'is-active' : ''}`}
              onClick={() => { pause(); setProfileManagerOpen(true); setProfileMessage('') }}
              aria-label="Administrar perfiles" title="Administrar perfiles">+</button>
          </div>
          <div className="teleprompter-top-actions">
            <div className="teleprompter-voice-control">
              <button className={`teleprompter-voice-toggle ${followVoice ? 'is-active' : ''}`} aria-pressed={followVoice}
                onClick={() => {
                  pause()
                  setFollowVoice(value => !value)
                  const index = tracker.script.phrases.findIndex(phrase => phrase.paragraph === currentBlock)
                  tracker.seekPhrase(Math.max(0, index))
                  setActivePhrase(null)
                  setVoiceWord(-1)
                  setVoiceStatus(`Pulsa Play y lee el guion en ${scriptLanguage === 'en' ? 'inglés' : 'español'}`)
                }}>Seguir mi voz</button>
              {followVoice && <span className="teleprompter-voice-status" role="status" title={voiceStatus}>
                <span aria-hidden="true" />{voiceStatus}
              </span>}
            </div>
            {!dedicated && <Button bare className="teleprompter-second-window" icon="app-window-expand"
              tooltip="Abrir en otra ventana" onClick={openInSeparateWindow}
              aria-label="Abrir teleprompter en otra ventana" />}
            <button className="teleprompter-close" onClick={toggle} aria-label="Cerrar teleprompter">×</button>
          </div>
        </header>

        {profileManagerOpen && <div className="teleprompter-profile-manager-backdrop"
          onMouseDown={event => { if (event.target === event.currentTarget) setProfileManagerOpen(false) }}>
          <section className="teleprompter-profile-manager" role="dialog" aria-modal="true"
            aria-labelledby="teleprompter-profile-manager-title">
            <header>
              <div>
                <span className="teleprompter-kicker">BIBLIOTECA PERSONAL</span>
                <h2 id="teleprompter-profile-manager-title">Perfiles del guion</h2>
              </div>
              <button onClick={() => setProfileManagerOpen(false)} aria-label="Cerrar administrador">×</button>
            </header>

            <div className="teleprompter-profile-manager-scroll">
              <section className="teleprompter-profile-manager-section">
                <div className="teleprompter-profile-manager-heading">
                  <div><strong>Integrados</strong><span>Quita lo que no uses y restáuralo después.</span></div>
                  <span>{builtInScriptProfiles.length}</span>
                </div>
                <div className="teleprompter-profile-list">
                  {builtInScriptProfiles.map(item => {
                    const hidden = hiddenScriptProfiles.includes(item.id)
                    return <article key={item.id} className={hidden ? 'is-muted' : ''}>
                      <div><strong>{item.label}</strong><span>{item.description}</span></div>
                      <button onClick={() => toggleBuiltInScriptProfile(item.id)}>
                        {hidden ? 'Restaurar' : 'Quitar'}
                      </button>
                    </article>
                  })}
                </div>
              </section>

              <section className="teleprompter-profile-manager-section">
                <div className="teleprompter-profile-manager-heading">
                  <div><strong>Personalizados</strong><span>Se guardan en este dispositivo.</span></div>
                  <span>{customScriptProfiles.length}/20</span>
                </div>
                {customScriptProfiles.length > 0 && <div className="teleprompter-profile-list is-custom">
                  {customScriptProfiles.map(item => editingProfileId === item.id
                    ? <article key={item.id} className="is-editing">
                      <form className="teleprompter-edit-profile"
                        onSubmit={event => saveEditedScriptProfile(event, item)}>
                        <label>
                          <span>NOMBRE</span>
                          <input autoFocus value={editProfileLabel} maxLength={36}
                            onChange={event => setEditProfileLabel(event.target.value)} />
                        </label>
                        <label>
                          <span>MARCADOR</span>
                          <div className="teleprompter-marker-input">
                            <span>profile:</span>
                            <input value={editProfileMarker} maxLength={40}
                              onChange={event => setEditProfileMarker(normalizeProfileMarker(event.target.value))} />
                          </div>
                        </label>
                        <div className="teleprompter-profile-row-actions">
                          <button type="button" onClick={cancelEditingScriptProfile}>Cancelar</button>
                          <button className="is-primary" type="submit"
                            disabled={!editProfileLabel.trim() || !editProfileMarker}>Guardar</button>
                        </div>
                      </form>
                    </article>
                    : <article key={item.id}>
                      <div>
                        <strong>{item.label}</strong>
                        <code>teleprompter:profile:{item.marker}</code>
                      </div>
                      <div className="teleprompter-profile-row-actions">
                        <button onClick={() => { void copyCustomProfileMarkers(item) }}>Copiar</button>
                        <button onClick={() => startEditingScriptProfile(item)}>Editar</button>
                        <button className="is-danger" onClick={() => deleteCustomScriptProfile(item)}>Eliminar</button>
                      </div>
                    </article>)}
                </div>}

                <form className="teleprompter-new-profile" onSubmit={createScriptProfile}>
                  <div className="teleprompter-new-profile-title">
                    <strong>Crear un perfil</strong>
                    <span>El marcador separa su contenido dentro de cualquier nota.</span>
                  </div>
                  <label>
                    <span>NOMBRE</span>
                    <input value={draftProfileLabel} maxLength={36} placeholder="Ej. Entrevista"
                      onChange={event => {
                        const previousAutomatic = normalizeProfileMarker(draftProfileLabel)
                        const label = event.target.value
                        setDraftProfileLabel(label)
                        if (!draftProfileMarker || draftProfileMarker === previousAutomatic) {
                          setDraftProfileMarker(normalizeProfileMarker(label))
                        }
                      }} />
                  </label>
                  <label>
                    <span>MARCADOR</span>
                    <div className="teleprompter-marker-input">
                      <span>profile:</span>
                      <input value={draftProfileMarker} maxLength={40} placeholder="entrevista"
                        onChange={event => setDraftProfileMarker(normalizeProfileMarker(event.target.value))} />
                    </div>
                  </label>
                  <button className="teleprompter-create-profile" type="submit"
                    disabled={!draftProfileLabel.trim() || !draftProfileMarker}>Crear perfil</button>
                </form>
              </section>
            </div>

            {(profileMessage || lastDeletedProfile) && <footer>
              <span role="status">{profileMessage}</span>
              {lastDeletedProfile && <button onClick={undoDeleteCustomProfile}>Deshacer</button>}
            </footer>}
          </section>
        </div>}

        <main className="teleprompter-viewport" ref={viewportRef} onScroll={handleScroll}
          onDoubleClick={() => setControlsHidden(value => !value)}>
          <div className="teleprompter-focus-line" aria-hidden="true" />
          {selected.text ? (
            <div ref={scriptRef} className={`teleprompter-script ${mirror ? 'is-mirrored' : ''}`}
              style={{ fontSize: `${fontSize}px`, fontFamily: getFontFamilyCss(fontFamily) }}>
              {paragraphs.map((paragraph, index) => (
                <p key={index} className={currentBlock === index ? 'is-active' : ''}>
                  {followVoice ? tracker.script.phrases.map((phrase, phraseIndex) => {
                    if (phrase.paragraph !== index) return null
                    let wordIndex = phrase.startWord
                    return <span key={phraseIndex} data-phrase={phraseIndex}
                      className={`teleprompter-phrase ${activePhrase === phraseIndex ? 'is-reading' : ''}`}
                      role="button" tabIndex={0} aria-label={`Leer desde: ${phrase.text}`}
                      onClick={() => choosePhrase(phraseIndex)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.code === 'Space') {
                          event.preventDefault(); event.stopPropagation(); choosePhrase(phraseIndex)
                        }
                      }}>
                      {phrase.text.split(/([\p{L}\p{N}]+(?:\p{M}+[\p{L}\p{N}]*)*)/gu).map((part, partIndex) =>
                        /[\p{L}\p{N}]/u.test(part) ? <span key={partIndex} data-word={wordIndex++}>{part}</span> : part)}
                    </span>
                  }) : paragraph}
                </p>
              ))}
            </div>
          ) : (
            <div className="teleprompter-empty">
              <span>{selected.custom ? 'PERFIL SIN CONTENIDO' : 'GUION VACÍO'}</span>
              <h2>{selected.custom ? `Añade contenido para “${selected.label}”.` : 'No encontré diálogo en esta sección.'}</h2>
              {selected.custom && selected.marker ? <>
                <code>{getCustomProfileMarkers(selected.marker).start}</code>
                <p>Coloca el contenido debajo y ciérralo con el marcador correspondiente.</p>
                <button onClick={() => {
                  const item = customScriptProfiles.find(profile => profile.id === selected.id)
                  if (item) void copyCustomProfileMarkers(item)
                }}>Copiar estructura</button>
              </> : <p>Prueba “Nota limpia” o añade bloques con “Voz / diálogo” o “Voice / dialogue”.</p>}
            </div>
          )}
          {countdownValue !== null && <div className="teleprompter-countdown">{countdownValue}</div>}
        </main>

        <footer className="teleprompter-controls">
          <div className="teleprompter-control-group teleprompter-transport">
            <button onClick={() => goToBlock(-1)} title="Bloque anterior (←)" aria-label="Bloque anterior">‹</button>
            <button onClick={reset} title="Reiniciar (R)" aria-label="Reiniciar">↺</button>
            <button className="teleprompter-play" onClick={playing || countdownValue !== null ? pause : play} disabled={!selected.text}>
              {playing || countdownValue !== null ? 'Ⅱ' : '▶'}
            </button>
            <button className={mirror ? 'is-active' : ''} onClick={() => setMirror(value => !value)} title="Espejo (M)" aria-label="Activar modo espejo">⇆</button>
            <button onClick={() => goToBlock(1)} title="Siguiente bloque (→)" aria-label="Siguiente bloque">›</button>
            <span className="teleprompter-chapter">{paragraphs.length ? currentBlock + 1 : 0}/{paragraphs.length}</span>
          </div>

          <label className="teleprompter-slider">
            <span>RITMO <strong>{followVoice ? 'Tu voz' : `${speed} ppm`}</strong></span>
            <input type="range" min="60" max="240" step="5" value={speed} disabled={followVoice}
              onChange={event => setSpeed(Number(event.target.value))} />
          </label>
          <label className="teleprompter-slider">
            <span>TEXTO <strong>{fontSize}px</strong></span>
            <input type="range" min="32" max="104" step="2" value={fontSize}
              onChange={event => setFontSize(Number(event.target.value))} />
          </label>
          <label className="teleprompter-select teleprompter-font-family-select">
            <span>FUENTE</span>
            <select value={fontFamily}
              onFocus={() => { void loadDeviceFonts() }}
              onPointerDown={() => { void loadDeviceFonts() }}
              onChange={event => setFontFamily(normalizeFontFamily(event.target.value))}>
              <option value="app">Fuente de Inkdrop</option>
              {selectedLocalFont && !deviceFonts.some(font => font.id === fontFamily) &&
                <option value={fontFamily}>{selectedLocalFont}</option>}
              {deviceFonts.map(font => <option key={font.id} value={font.id}>{font.family}</option>)}
              {fontLibraryStatus === 'loading' && <option disabled>Cargando fuentes…</option>}
              {fontLibraryStatus === 'error' && <option disabled>No se pudo acceder · vuelve a intentar</option>}
            </select>
          </label>
          <label className="teleprompter-select teleprompter-countdown-select">
            <span>CUENTA ATRÁS</span>
            <select value={countdown} onChange={event => setCountdown(Number(event.target.value))}>
              {[0, 3, 5, 10].map(value => <option key={value} value={value}>{value === 0 ? 'Sin espera' : `${value} s`}</option>)}
            </select>
          </label>

          <div className="teleprompter-metrics">
            <span>{wordCount} palabras</span>
            <strong>{followVoice ? 'Por voz' : formatDuration(wordCount, speed)}</strong>
          </div>
          <div className="teleprompter-progress" aria-label={`Progreso ${Math.round(progress * 100)}%`}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        </footer>
    </div>
  )

  return (
    <Dialog {...modal.state} className={`teleprompter-modal ${dedicated ? 'is-dedicated' : ''}`} onBackdropClick={() => undefined}>
      {teleprompter}
    </Dialog>
  )
}
