import { describe, expect, it } from 'vitest'
import { createNullAudio } from '@automata/engine'
import { registerSounds, SOUNDS } from '../../src/audio/sounds'

describe('registerSounds', () => {
  it('registers every declared sound id with the audio port', () => {
    const audio = createNullAudio()
    registerSounds(audio.port)
    const ids = audio.calls.filter((c) => c.op === 'register').map((c) => c.id)
    expect(ids.sort()).toEqual(Object.keys(SOUNDS).sort())
  })
})
