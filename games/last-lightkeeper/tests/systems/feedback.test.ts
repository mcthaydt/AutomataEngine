import { createNullAudio } from '@automata/engine'
import { describe, expect, it } from 'vitest'
import { registerSounds } from '../../src/audio/sounds'
import { FEEDBACK, drainFeedback, type PresentationFeedbackPort } from '../../src/systems/feedback'
import { createInitialNight, type FeedbackEventType } from '../../src/state/night'

function presentation() {
  const calls: string[] = []
  const port: PresentationFeedbackPort = { trigger: (kind) => calls.push(kind) }
  return { port, calls }
}

describe('simulation feedback drain', () => {
  it('maps every simulation feedback kind to a registered sound and presentation trigger', () => {
    const audio = createNullAudio()
    registerSounds(audio.port)
    const registered = new Set(audio.calls.filter((call) => call.op === 'register').map((call) => call.id))
    const kinds: FeedbackEventType[] = [
      'generator-overheat', 'high-water', 'darkness-warning', 'call-incoming',
      'call-acknowledged', 'bearing-known', 'ship-rescued', 'ship-lost'
    ]
    expect(Object.keys(FEEDBACK)).toEqual(kinds)
    for (const kind of kinds) {
      expect(registered.has(FEEDBACK[kind].sound)).toBe(true)
      expect(FEEDBACK[kind].triggers.length).toBeGreaterThan(0)
    }
  })

  it('plays and triggers every queued event exactly once, then clears the queue', () => {
    const state = createInitialNight(1, 42)
    state.feedback = [
      { type: 'call-incoming', timeS: 1 },
      { type: 'ship-rescued', timeS: 2 }
    ]
    const audio = createNullAudio()
    registerSounds(audio.port)
    const view = presentation()

    const drained = drainFeedback(state, audio.port, view.port)
    expect(audio.calls.filter((call) => call.op === 'play').map((call) => call.id))
      .toEqual([FEEDBACK['call-incoming'].sound, FEEDBACK['ship-rescued'].sound])
    expect(view.calls).toEqual([
      ...FEEDBACK['call-incoming'].triggers,
      ...FEEDBACK['ship-rescued'].triggers
    ])
    expect(drained.feedback).toEqual([])

    drainFeedback(drained, audio.port, view.port)
    expect(audio.calls.filter((call) => call.op === 'play')).toHaveLength(2)
  })

  it('ignores unknown feedback safely while still draining it', () => {
    const state = createInitialNight(1, 42)
    state.feedback = [{ type: 'unknown-feedback' as FeedbackEventType, timeS: 1 }]
    const audio = createNullAudio()
    const view = presentation()
    expect(() => drainFeedback(state, audio.port, view.port)).not.toThrow()
    expect(drainFeedback(state, audio.port, view.port).feedback).toEqual([])
    expect(view.calls).toEqual([])
  })
})
