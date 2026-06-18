import { describe, expect, it } from 'vitest'
import { createNullAudio } from '../../src/audio/null'

const beep = { freq: 440, durationS: 0.1, type: 'sine' as const, gain: 0.5 }

describe('createNullAudio', () => {
  it('records register / setMasterVolume / play', () => {
    const audio = createNullAudio()
    audio.port.register('pickup', beep)
    audio.port.setMasterVolume(0.4)
    audio.port.play('pickup')
    expect(audio.calls.map((c) => c.op)).toEqual(['register', 'setMasterVolume', 'play'])
    expect(audio.calls[0]).toMatchObject({ id: 'pickup', spec: beep })
    expect(audio.calls[1]).toMatchObject({ volume: 0.4 })
  })

  it('ignores play of an unregistered id', () => {
    const audio = createNullAudio()
    audio.port.play('nope')
    expect(audio.calls).toEqual([])
  })
})
