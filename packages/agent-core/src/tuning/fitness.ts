import type { TestPlayResult } from '@automata/contracts'

export interface FitnessTarget {
  /** Reward completion in the step band [minSteps, maxSteps]; outside it tapers. */
  minSteps: number
  maxSteps: number
  /** Optional bonus when the run picks up at least this many bananas. */
  bananas?: number
}

export function scoreFitness(result: TestPlayResult, target: FitnessTarget): number {
  if (result.outcome !== 'completed') return 0

  let score = 1
  if (result.steps < target.minSteps) score -= (target.minSteps - result.steps) / target.minSteps
  else if (result.steps > target.maxSteps) score -= (result.steps - target.maxSteps) / target.maxSteps

  score -= result.fallCount * 0.5
  if (target.bananas !== undefined && result.bananas >= target.bananas) score += 0.25
  return score
}
