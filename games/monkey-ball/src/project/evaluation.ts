import type { ArchetypeLibrary } from '@automata/engine'
import type { ProjectSnapshot } from '@automata/project'
import {
  runHeadlessPlay,
  type PlayObservation,
  type TestPlayResult
} from '../level/headlessPlay'
import { monkeyBallProjectDefinition } from './definition'

export interface MonkeyBallEvaluationResult {
  outcome: 'passed' | 'failed' | 'incomplete'
  score: number
  metrics: Record<string, number | string | boolean>
  steps: number
}

export interface MonkeyBallFitnessTarget {
  /** Reward completion in this step band; runs outside it taper. */
  minSteps: number
  maxSteps: number
  /** Optional bonus when the run collects at least this many bananas. */
  bananas?: number
}

export interface SeekGoalOptions {
  /** Stop steering within this XZ distance of the goal. Default 0.5. */
  arriveRadius?: number
}

const DEFAULT_FITNESS_TARGET: MonkeyBallFitnessTarget = { minSteps: 300, maxSteps: 900 }

/** Monkey Ball-specific completion policy, kept beside its evaluation adapter. */
export function scoreMonkeyBallFitness(
  result: TestPlayResult,
  target: MonkeyBallFitnessTarget
): number {
  if (result.outcome !== 'completed') return 0

  let score = 1
  if (result.steps < target.minSteps) score -= (target.minSteps - result.steps) / target.minSteps
  else if (result.steps > target.maxSteps) score -= (result.steps - target.maxSteps) / target.maxSteps
  score -= result.fallCount * 0.5
  if (target.bananas !== undefined && result.bananas >= target.bananas) score += 0.25
  return score
}

/** Closed-loop input policy used only by Monkey Ball's deterministic evaluator. */
export function createSeekGoalPlayer(
  options: SeekGoalOptions = {}
): (step: number, observation: PlayObservation) => { x: number; y: number } {
  const arriveRadius = options.arriveRadius ?? 0.5
  return (_step, observation) => {
    const dx = observation.goal.x - observation.ball.position.x
    const dz = observation.goal.z - observation.ball.position.z
    const distance = Math.hypot(dx, dz)
    if (distance <= arriveRadius) return { x: 0, y: 0 }
    return { x: dx / distance, y: -dz / distance }
  }
}

/** Compile and evaluate the entry scene through the existing deterministic runner. */
export async function evaluateMonkeyBallProject(
  snapshot: ProjectSnapshot,
  lib: ArchetypeLibrary,
  opts: { maxSteps: number }
): Promise<MonkeyBallEvaluationResult> {
  const compiled = monkeyBallProjectDefinition.compile(snapshot)
  const levelId = snapshot.manifest.entrySceneId
  const level = compiled.levels[levelId]
  if (!level) throw new Error(`Monkey Ball evaluation: missing entry level "${levelId}"`)

  const result = await runHeadlessPlay(level, lib, compiled.tuning, {
    maxSteps: opts.maxSteps,
    input: createSeekGoalPlayer()
  })
  const outcome = result.outcome === 'completed' ? 'passed' : result.outcome === 'gameOver' ? 'failed' : 'incomplete'
  return {
    outcome,
    score: scoreMonkeyBallFitness(result, DEFAULT_FITNESS_TARGET),
    metrics: {
      levelId,
      timeMs: result.timeMs,
      falls: result.fallCount,
      bananas: result.bananas
    },
    steps: result.steps
  }
}
