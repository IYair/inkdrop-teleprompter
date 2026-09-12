import assert from 'node:assert/strict'
import test from 'node:test'
import { ScrollEngine } from '../src/scrollEngine.ts'

function quantizedPlayback(settings, hz = 60) {
  let position = 0
  let nextFrame
  let time = 0
  let finished = 0
  const target = {
    get scrollTop() { return position },
    set scrollTop(value) {
      position = Math.max(0, Math.min(this.scrollHeight - this.clientHeight, Math.round(value)))
    },
    scrollHeight: 10000,
    clientHeight: 500
  }
  const engine = new ScrollEngine({
    requestFrame: callback => { nextFrame = callback; return 1 },
    cancelFrame: () => { nextFrame = undefined },
    getTarget: () => target,
    getSettings: () => settings,
    onProgress: () => undefined,
    onFinish: () => { finished++ }
  })
  const tick = () => {
    assert.ok(nextFrame, 'playback must keep scheduling frames')
    const callback = nextFrame
    nextFrame = undefined
    callback(time)
    time += 1000 / hz
  }
  engine.start()
  tick()
  return { engine, target, tick, get finished() { return finished } }
}

test('preserves subpixel movement across all rhythm/font settings and refresh rates', () => {
  for (const hz of [30, 60, 120, 144]) {
    for (let speedWpm = 60; speedWpm <= 240; speedWpm += 5) {
      for (let fontSize = 32; fontSize <= 104; fontSize += 2) {
        const playback = quantizedPlayback({ speedWpm, fontSize }, hz)
        for (let frame = 0; frame < hz; frame++) playback.tick()
        const expected = (speedWpm / 135) * fontSize * 0.72
        assert.ok(Math.abs(playback.target.scrollTop - expected) <= 1,
          `${speedWpm} ppm / ${fontSize}px / ${hz}Hz: expected ${expected}, got ${playback.target.scrollTop}`)
        playback.engine.stop()
      }
    }
  }
})

test('continues across the stalling threshold when rhythm and font change while playing', () => {
  const settings = { speedWpm: 240, fontSize: 104 }
  const playback = quantizedPlayback(settings, 120)
  for (let i = 0; i < 120; i++) playback.tick()
  const before = playback.target.scrollTop
  settings.speedWpm = 60
  settings.fontSize = 32
  for (let i = 0; i < 120; i++) playback.tick()
  assert.ok(Math.abs(playback.target.scrollTop - before - 10.24) <= 1)
  assert.equal(playback.engine.running, true)
})

test('respects manual scrolling and pause/resume without jumping to a stale position', () => {
  const playback = quantizedPlayback({ speedWpm: 60, fontSize: 32 }, 120)
  for (let i = 0; i < 120; i++) playback.tick()
  playback.target.scrollTop = 400
  for (let i = 0; i < 120; i++) playback.tick()
  assert.ok(Math.abs(playback.target.scrollTop - 410.24) <= 1)
  playback.engine.stop()
  playback.target.scrollTop = 0
  playback.engine.start()
  playback.tick()
  for (let i = 0; i < 120; i++) playback.tick()
  assert.ok(Math.abs(playback.target.scrollTop - 10.24) <= 1)
})

test('finishes once at the end even at a subpixel-per-frame speed', () => {
  const playback = quantizedPlayback({ speedWpm: 60, fontSize: 32 }, 120)
  playback.target.scrollTop = 9495
  for (let i = 0; i < 120 && playback.engine.running; i++) playback.tick()
  assert.equal(playback.engine.running, false)
  assert.equal(playback.finished, 1)
  assert.ok(playback.target.scrollTop >= 9499)
})

test('starts immediately and advances at 54px without a countdown', () => {
  const frames = []
  const target = { scrollTop: 0, scrollHeight: 3000, clientHeight: 750 }
  let progress = 0
  const engine = new ScrollEngine({
    requestFrame: callback => {
      frames.push(callback)
      return frames.length
    },
    cancelFrame: () => undefined,
    getTarget: () => target,
    getSettings: () => ({ speedWpm: 120, fontSize: 54 }),
    onProgress: value => { progress = value },
    onFinish: () => assert.fail('must not finish on the first second')
  })

  engine.start()
  assert.equal(frames.length, 1)
  frames.shift()(0)
  frames.shift()(1000)

  assert.ok(target.scrollTop > 34)
  assert.ok(progress > 0)
})

test('keeps advancing when the font size changes during playback', () => {
  const frames = []
  const target = { scrollTop: 100, scrollHeight: 3000, clientHeight: 750 }
  let fontSize = 60
  const engine = new ScrollEngine({
    requestFrame: callback => {
      frames.push(callback)
      return frames.length
    },
    cancelFrame: () => undefined,
    getTarget: () => target,
    getSettings: () => ({ speedWpm: 120, fontSize }),
    onProgress: () => undefined,
    onFinish: () => assert.fail('must remain active')
  })

  engine.start()
  frames.shift()(0)
  frames.shift()(1000)
  const beforeResize = target.scrollTop
  fontSize = 54
  frames.shift()(2000)

  assert.ok(target.scrollTop > beforeResize)
  assert.equal(engine.running, true)
})
