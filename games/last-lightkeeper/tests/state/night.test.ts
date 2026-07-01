import { describe, expect, it } from 'vitest'
import { createInitialNight, createNightReducer } from '../../src/state/night'

describe('night state', () => {
  it('creates a fresh deterministic run with safe lighthouse defaults', () => {
    expect(createInitialNight(3, 42)).toMatchObject({
      runId: 3,
      seed: 42,
      timeS: 0,
      keeper: { floor: 'quarters', x: 0, mode: 'idle', carriedItem: null },
      integrity: 100,
      flooding: 0,
      generator: { heat: 0, damage: 0, capacity: 3 },
      rescues: 0,
      losses: 0,
      outcome: null,
      score: 0
    })
  })

  it('starts with beacon, radio, and bilge requested ahead of workshop', () => {
    const night = createInitialNight(0, 1)
    expect(night.circuitPriority).toEqual(['beacon', 'radio', 'bilge', 'workshop'])
    expect(night.circuits).toEqual({
      beacon: { requested: true, powered: true, tripped: false },
      radio: { requested: true, powered: true, tripped: false },
      bilge: { requested: true, powered: true, tripped: false },
      workshop: { requested: false, powered: false, tripped: false }
    })
  })

  it('replaces state only with a nightAdvanced action', () => {
    const reducer = createNightReducer()
    const state = createInitialNight(1, 10)
    const next = { ...state, timeS: 5 }
    expect(reducer(state, { type: 'nightAdvanced', night: next })).toBe(next)
    expect(reducer(state, { type: 'paused' })).toBe(state)
  })
})
