export interface ScrollTarget {
  scrollTop: number
  readonly scrollHeight: number
  readonly clientHeight: number
}

interface ScrollSettings {
  speedWpm: number
  fontSize: number
}

interface ScrollEngineOptions {
  requestFrame: (callback: FrameRequestCallback) => number
  cancelFrame: (id: number) => void
  getTarget: () => ScrollTarget | null
  getSettings: () => ScrollSettings
  onProgress: (progress: number) => void
  onFinish: () => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export class ScrollEngine {
  running = false
  private frameId: number | null = null
  private lastFrame: number | null = null
  private target: ScrollTarget | null = null
  private position = 0
  private lastAppliedPosition: number | null = null
  private readonly options: ScrollEngineOptions

  constructor(options: ScrollEngineOptions) {
    this.options = options
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastFrame = null
    this.target = null
    this.lastAppliedPosition = null
    this.frameId = this.options.requestFrame(this.step)
  }

  stop(): void {
    if (this.frameId !== null) this.options.cancelFrame(this.frameId)
    this.frameId = null
    this.lastFrame = null
    this.running = false
  }

  private readonly step: FrameRequestCallback = timestamp => {
    if (!this.running) return
    const target = this.options.getTarget()
    if (target && (target !== this.target || target.scrollTop !== this.lastAppliedPosition)) {
      // Rebase after manual scrolling, layout clamping, or a replaced viewport.
      this.position = target.scrollTop
      this.lastAppliedPosition = target.scrollTop
      this.target = target
    }
    if (target && this.lastFrame !== null) {
      const { speedWpm, fontSize } = this.options.getSettings()
      const pixelsPerSecond = (speedWpm / 135) * (fontSize * 0.72)
      // Keep subpixels here: reading scrollTop back each frame can discard them
      // on quantized viewports, causing low speeds/high refresh rates to stall.
      this.position = clamp(
        this.position + (pixelsPerSecond * (timestamp - this.lastFrame)) / 1000,
        0,
        Math.max(0, target.scrollHeight - target.clientHeight)
      )
      target.scrollTop = this.position
      this.lastAppliedPosition = target.scrollTop
      const maxScroll = Math.max(1, target.scrollHeight - target.clientHeight)
      const progress = clamp(target.scrollTop / maxScroll, 0, 1)
      this.options.onProgress(progress)
      if (target.scrollTop >= maxScroll - 1) {
        this.stop()
        this.options.onFinish()
        return
      }
    }
    this.lastFrame = timestamp
    this.frameId = this.options.requestFrame(this.step)
  }
}
