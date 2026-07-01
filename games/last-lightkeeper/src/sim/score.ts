import type { NightDefinition } from '../data/schema'
import type { NightState } from '../state/night'

export interface ScoreBreakdown {
  rescuePoints: number
  integrityBonus: number
  outagePenalty: number
  efficiencyBonus: number
  total: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function calculateScoreBreakdown(
  state: NightState,
  definition: NightDefinition
): ScoreBreakdown {
  const rescuePoints = Math.round(state.rescues * definition.score.rescue)
  const integrityBonus = Math.round(clamp(state.integrity, 0, 100) * definition.score.integrity)
  const outagePenalty = -Math.round(Math.max(0, state.outageS) * definition.score.outagePenalty)
  const efficiencyBonus = Math.round(
    (1 - clamp(state.generator.damage, 0, 1)) * definition.score.efficiency
  )
  return {
    rescuePoints,
    integrityBonus,
    outagePenalty,
    efficiencyBonus,
    total: Math.max(0, rescuePoints + integrityBonus + outagePenalty + efficiencyBonus)
  }
}
