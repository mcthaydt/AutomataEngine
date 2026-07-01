import { describe, expect, it } from 'vitest'
import { nightDefinition } from '../../src/data/night'
import { evaluateTerminal, TERMINAL_REASONS } from '../../src/sim/terminal'
import { createInitialNight } from '../../src/state/night'

describe('terminal evaluation', () => {
  it('defeats immediately at terminal flooding', () => {
    const state = createInitialNight(1, 42)
    state.flooding = 100
    expect(evaluateTerminal(state, nightDefinition)).toMatchObject({
      outcome: 'defeat', terminalReason: TERMINAL_REASONS.flooded
    })
  })

  it('defeats immediately when integrity reaches zero', () => {
    const state = createInitialNight(1, 42)
    state.integrity = 0
    expect(evaluateTerminal(state, nightDefinition)).toMatchObject({
      outcome: 'defeat', terminalReason: TERMINAL_REASONS.collapsed
    })
  })

  it('defeats after darkness exceeds the safe timeout', () => {
    const state = createInitialNight(1, 42)
    state.darknessS = nightDefinition.rules.maxDarkS + 0.01
    expect(evaluateTerminal(state, nightDefinition)).toMatchObject({
      outcome: 'defeat', terminalReason: TERMINAL_REASONS.darkness
    })
  })

  it('defeats at dawn with fewer than the rescue target', () => {
    const state = createInitialNight(1, 42)
    state.timeS = nightDefinition.rules.durationS
    state.rescues = nightDefinition.rules.rescueTarget - 1
    expect(evaluateTerminal(state, nightDefinition)).toMatchObject({
      outcome: 'defeat', terminalReason: TERMINAL_REASONS.rescues
    })
  })

  it('wins at dawn with enough rescues and a safe lighthouse', () => {
    const state = createInitialNight(1, 42)
    state.timeS = nightDefinition.rules.durationS
    state.rescues = nightDefinition.rules.rescueTarget
    state.integrity = 1
    state.flooding = 99.9
    state.darknessS = nightDefinition.rules.maxDarkS
    expect(evaluateTerminal(state, nightDefinition)).toMatchObject({
      outcome: 'victory', terminalReason: TERMINAL_REASONS.dawn
    })
  })

  it('keeps the first terminal result stable', () => {
    const state = createInitialNight(1, 42)
    state.outcome = 'defeat'
    state.terminalReason = TERMINAL_REASONS.flooded
    state.flooding = 0
    state.timeS = nightDefinition.rules.durationS
    state.rescues = 4
    expect(evaluateTerminal(state, nightDefinition)).toBe(state)
  })
})
