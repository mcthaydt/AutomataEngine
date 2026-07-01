import { describe, expect, it } from 'vitest'
import { nightDefinition } from '../../src/data/night'
import { calculateScoreBreakdown } from '../../src/sim/score'
import { createInitialNight } from '../../src/state/night'

describe('night score breakdown', () => {
  it('returns named rescue, integrity, outage, and efficiency line items', () => {
    const state = createInitialNight(1, 42)
    state.rescues = 3
    state.integrity = 80
    state.outageS = 12.5
    state.generator.damage = 0.2

    expect(calculateScoreBreakdown(state, nightDefinition)).toEqual({
      rescuePoints: 3000,
      integrityBonus: 800,
      outagePenalty: -50,
      efficiencyBonus: 200,
      total: 3950
    })
  })

  it('rounds every line item deterministically', () => {
    const state = createInitialNight(1, 42)
    state.rescues = 1
    state.integrity = 80.55
    state.outageS = 0.125
    state.generator.damage = 0.333
    const score = calculateScoreBreakdown(state, nightDefinition)

    expect(score).toMatchObject({
      rescuePoints: 1000,
      integrityBonus: 806,
      outagePenalty: -1,
      efficiencyBonus: 167
    })
    expect(score.total).toBe(1972)
  })

  it('never returns a negative total', () => {
    const state = createInitialNight(1, 42)
    state.integrity = 0
    state.outageS = 1000
    state.generator.damage = 1
    expect(calculateScoreBreakdown(state, nightDefinition).total).toBe(0)
  })
})
