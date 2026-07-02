import { createNullAudio } from '@automata/engine'
import { describe, expect, it } from 'vitest'
import { SOUNDS, registerSounds } from '../../src/audio/sounds'

describe('Last Lightkeeper sounds', () => {
  it('registers every required synthesized sound family through AudioPort', () => {
    expect(Object.keys(SOUNDS)).toEqual([
      'storm', 'machinery', 'radio', 'alarm', 'repair',
      'beacon', 'rescue', 'failure', 'dawn', 'ui'
    ])
    const audio = createNullAudio()
    registerSounds(audio.port)
    expect(audio.calls.filter((call) => call.op === 'register').map((call) => call.id))
      .toEqual(Object.keys(SOUNDS))
  })

  it('defines valid oscillator frequency, duration, waveform, and gain', () => {
    for (const sound of Object.values(SOUNDS)) {
      expect(sound.freq).toBeGreaterThan(0)
      expect(sound.durationS).toBeGreaterThan(0)
      expect(sound.gain).toBeGreaterThan(0)
      expect(sound.gain).toBeLessThanOrEqual(1)
      expect(['sine', 'square', 'triangle', 'sawtooth']).toContain(sound.type)
    }
  })
})
