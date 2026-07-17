import { describe, expect, it } from 'vitest'
import { createClock, stepClock } from '../src/clockCore'

describe('clockCore', () => {
  it('accumulates within a slot without change', () => {
    const { state, slotChanged } = stepClock(createClock(), 5, 20)
    expect(state).toEqual({ slot: 0, elapsedInSlot: 5 })
    expect(slotChanged).toBe(false)
  })

  it('advances and wraps on boundaries', () => {
    let clock = createClock()
    for (let slot = 1; slot <= 4; slot += 1) {
      const step = stepClock(clock, 20, 20)
      expect(step.slotChanged).toBe(true)
      expect(step.state.slot).toBe(slot % 4)
      clock = step.state
    }
    expect(clock).toEqual({ slot: 0, elapsedInSlot: 0 })
  })

  it('handles a dt spanning multiple slots', () => {
    const { state, slotChanged } = stepClock(createClock(), 45, 20)
    expect(state).toEqual({ slot: 2, elapsedInSlot: 5 })
    expect(slotChanged).toBe(true)
  })

  it('is deterministic across split ticks (10×2 === 1×20 boundary)', () => {
    let split = createClock()
    for (let i = 0; i < 10; i += 1) split = stepClock(split, 2, 20).state
    expect(split).toEqual(stepClock(createClock(), 20, 20).state)
  })
})
