import type { NightDefinition } from '../data/schema'
import type { NightOutcome, NightState } from '../state/night'

export const TERMINAL_REASONS = {
  flooded: 'The lighthouse flooded',
  collapsed: 'The lighthouse structure failed',
  darkness: 'The beacon stayed dark too long',
  rescues: 'Too few ships were rescued before dawn',
  dawn: 'Dawn reached with the lighthouse standing'
} as const

function finish(state: NightState, outcome: Exclude<NightOutcome, null>, reason: string): NightState {
  return { ...state, outcome, terminalReason: reason }
}

export function evaluateTerminal(state: NightState, definition: NightDefinition): NightState {
  if (state.outcome !== null) return state
  if (state.flooding >= 100) return finish(state, 'defeat', TERMINAL_REASONS.flooded)
  if (state.integrity <= 0) return finish(state, 'defeat', TERMINAL_REASONS.collapsed)
  if (state.darknessS > definition.rules.maxDarkS) {
    return finish(state, 'defeat', TERMINAL_REASONS.darkness)
  }
  if (state.timeS < definition.rules.durationS) return state
  if (state.rescues < definition.rules.rescueTarget) {
    return finish(state, 'defeat', TERMINAL_REASONS.rescues)
  }
  return finish(state, 'victory', TERMINAL_REASONS.dawn)
}
