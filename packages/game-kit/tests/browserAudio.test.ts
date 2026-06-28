import { describe, expect, it, vi } from 'vitest'
import { createBrowserAudio } from '../src/browserAudio'

describe('createBrowserAudio', () => {
  it('falls back to silent audio when AudioContext creation fails', () => {
    const runtime = createBrowserAudio(() => { throw new Error('unavailable') })
    runtime.audio.register('beep', { freq: 440, durationS: 0.1, type: 'sine', gain: 0.2 })
    expect(() => runtime.audio.play('beep')).not.toThrow()
    expect(() => runtime.resume()).not.toThrow()
    expect(() => { runtime.dispose(); runtime.dispose() }).not.toThrow()
  })

  it('closes a real audio context exactly once', () => {
    const close = vi.fn(async () => {})
    const context = {
      destination: {},
      currentTime: 0,
      createGain: () => ({ connect() {}, gain: { value: 1 } }),
      resume: vi.fn(async () => {}),
      close
    } as unknown as AudioContext
    const runtime = createBrowserAudio(() => context)
    runtime.resume()
    runtime.dispose()
    runtime.dispose()
    expect(close).toHaveBeenCalledTimes(1)
    expect(context.resume).toHaveBeenCalledTimes(1)
  })

  it('uses the real-AudioContext default when no factory is given', () => {
    // happy-dom has no usable AudioContext, so the default constructor path
    // resolves to the silent fallback — exercising the default parameter.
    const runtime = createBrowserAudio()
    expect(() => runtime.audio.play('x')).not.toThrow()
    expect(() => runtime.dispose()).not.toThrow()
  })
})
