import { describe, expect, it } from 'vitest'
import { stepNight } from '../../src/sim/step'
import { createInitialNight } from '../../src/state/night'

describe('night input step', () => {
  it('moves before resolving a carry interaction', () => {
    const night = createInitialNight(1, 42)
    const state = {
      ...night,
      keeper: { ...night.keeper, floor: 'workshop' as const, x: -36, y: 72 }
    }

    const next = stepNight(
      state,
      { movement: { x: -1, y: 0 }, operate: false, carryPressed: true },
      0.25,
      { playing: true }
    )

    expect(next.keeper.x).toBe(-48)
    expect(next.keeper.carriedItem).toBe('wrench')
    expect(next.items.wrench).toBe('carried')
  })

  it('updates focus after movement before exposing station operation', () => {
    const night = createInitialNight(1, 42)
    const state = {
      ...night,
      keeper: { ...night.keeper, floor: 'navigation' as const, x: 20, y: 168 }
    }

    const next = stepNight(
      state,
      { movement: { x: 1, y: 0 }, operate: true, carryPressed: false },
      1 / 12,
      { playing: true }
    )

    expect(next.keeper.x).toBe(24)
    expect(next.focus).toMatchObject({ kind: 'station', id: 'chart' })
    expect(next.keeper.mode).toBe('operate')
  })

  it('leaves the complete night state untouched outside active play', () => {
    const state = createInitialNight(1, 42)
    expect(stepNight(
      state,
      { movement: { x: 1, y: 0 }, operate: true, carryPressed: true },
      1,
      { playing: false }
    )).toBe(state)
  })
})
