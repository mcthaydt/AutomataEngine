import { describe, expect, it } from 'vitest'
import { createBrowserAudio } from '../../src/audio/browserAudio'

describe('createBrowserAudio', () => {
  it('falls back to silent audio when AudioContext creation fails', () => {
    const runtime = createBrowserAudio(() => { throw new Error('AudioContext unavailable') })

    runtime.audio.register('beep', { freq: 440, durationS: 0.1, type: 'sine', gain: 0.2 })
    expect(() => runtime.audio.play('beep')).not.toThrow()
    expect(() => runtime.resume()).not.toThrow()
  })
})
