import type { ArchetypeLibrary } from '@automata/engine'
import type { ProjectSnapshot } from '@automata/project'
import { runHeadlessPlay } from '../level/headlessPlay'
import { monkeyBallProjectDefinition } from './definition'

export interface MonkeyBallEvaluationResult {
  outcome: 'passed' | 'failed' | 'incomplete'
  score: number
  metrics: Record<string, number | string | boolean>
  steps: number
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

  const result = await runHeadlessPlay(level, lib, compiled.tuning, { maxSteps: opts.maxSteps })
  const outcome = result.outcome === 'completed' ? 'passed' : result.outcome === 'gameOver' ? 'failed' : 'incomplete'
  const score = (outcome === 'passed' ? 1_000_000 : 0) - result.timeMs - result.fallCount * 10_000 + result.bananas * 1_000
  return {
    outcome,
    score,
    metrics: {
      levelId,
      timeMs: result.timeMs,
      falls: result.fallCount,
      bananas: result.bananas
    },
    steps: result.steps
  }
}
