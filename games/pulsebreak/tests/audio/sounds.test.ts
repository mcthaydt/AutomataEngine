import { describe, expect, it } from 'vitest'
import { createNullAudio } from '@automata/engine'
import { SOUNDS, registerSounds } from '../../src/audio/sounds'

describe('sounds', () => {
  it('registers every sound id on the audio port', () => {
    const audio = createNullAudio()
    registerSounds(audio.port)
    const registered = audio.calls.filter((c) => c.op === 'register').map((c) => c.id)
    expect(new Set(registered)).toEqual(new Set(Object.keys(SOUNDS)))
  })

  it('defines well-formed synthesis specs', () => {
    for (const spec of Object.values(SOUNDS)) {
      expect(spec.freq).toBeGreaterThan(0)
      expect(spec.durationS).toBeGreaterThan(0)
      expect(spec.gain).toBeGreaterThan(0)
      expect(spec.gain).toBeLessThanOrEqual(1)
      expect(['sine', 'square', 'triangle', 'sawtooth']).toContain(spec.type)
    }
  })
})
