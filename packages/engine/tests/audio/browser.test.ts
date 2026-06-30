import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebAudio } from '../../src/audio/browser'

function fakeContext() {
  const master = {
    connect: vi.fn(),
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }
  }
  const envelope = {
    connect: vi.fn(),
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }
  }
  const oscillator = {
    type: 'sine',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  }
  const context = {
    destination: {},
    currentTime: 2,
    createGain: vi.fn()
      .mockReturnValueOnce(master)
      .mockReturnValue(envelope),
    createOscillator: vi.fn(() => oscillator),
    resume: vi.fn(async () => undefined)
  }
  return { context, master, envelope, oscillator }
}

afterEach(() => vi.unstubAllGlobals())

describe('WebAudio adapter', () => {
  it('ignores unknown sounds and synthesizes registered envelopes', () => {
    const fake = fakeContext()
    const audio = createWebAudio(fake.context as never)

    audio.play('missing')
    expect(fake.context.createOscillator).not.toHaveBeenCalled()

    audio.register('hit', {
      freq: 440, durationS: 0.2, type: 'square', gain: 0.5
    })
    audio.play('hit')
    expect(fake.context.resume).toHaveBeenCalledOnce()
    expect(fake.oscillator).toMatchObject({ type: 'square', frequency: { value: 440 } })
    expect(fake.envelope.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 2.01)
    expect(fake.oscillator.start).toHaveBeenCalledWith(2)
    expect(fake.oscillator.stop).toHaveBeenCalledWith(2.2)

    audio.setMasterVolume(0.25)
    expect(fake.master.gain.value).toBe(0.25)
  })

  it('constructs a browser AudioContext by default', () => {
    const fake = fakeContext()
    const AudioContext = vi.fn(function () { return fake.context })
    vi.stubGlobal('AudioContext', AudioContext)
    createWebAudio()
    expect(AudioContext).toHaveBeenCalledOnce()
  })
})
