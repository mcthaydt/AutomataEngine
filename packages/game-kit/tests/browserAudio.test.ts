import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCleanupStack, type AudioPort } from '@automata/engine'
import { createBrowserAudio, mountAudio } from '../src/browserAudio'

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

describe('mountAudio', () => {
  let overlays: HTMLElement
  beforeEach(() => {
    document.body.replaceChildren()
    overlays = document.createElement('div')
    document.body.append(overlays)
  })

  it('registers sounds against the mounted audio port', () => {
    const cleanup = createCleanupStack()
    const register = vi.fn((_audio: AudioPort) => {})
    const mounted = mountAudio({ overlays, cleanup }, register)
    expect(register).toHaveBeenCalledWith(mounted.audio)
  })

  it('plays uiClick when a button inside overlays is clicked, and stops after cleanup', () => {
    const cleanup = createCleanupStack()
    const mounted = mountAudio({ overlays, cleanup }, () => {})
    const play = vi.spyOn(mounted.audio, 'play')

    const button = document.createElement('button')
    overlays.append(button)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(play).toHaveBeenCalledWith('uiClick')

    play.mockClear()
    overlays.dispatchEvent(new MouseEvent('click', { bubbles: true })) // not a button
    expect(play).not.toHaveBeenCalled()

    cleanup.dispose()
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(play).not.toHaveBeenCalled()
  })

  it('resumes audio on the first pointerdown', () => {
    const cleanup = createCleanupStack()
    const mounted = mountAudio({ overlays, cleanup }, () => {})
    const resume = vi.spyOn(mounted, 'resume')
    window.dispatchEvent(new Event('pointerdown'))
    expect(resume).toHaveBeenCalledTimes(1)
  })
})
