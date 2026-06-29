import type { ProjectSnapshot } from '@automata/project'
import { createHeadlessRun, kite } from '../sim/headlessRun'
import { pulsebreakProjectDefinition } from './definition'

export interface PulsebreakEvaluationResult {
  outcome: 'passed' | 'failed' | 'incomplete'
  score: number
  metrics: Record<string, number | string | boolean>
  steps: number
}

/** Runtime-safe normalized evaluation used by editor, agent, and MCP hosts. */
export async function evaluatePulsebreakProject(
  snapshot: ProjectSnapshot,
  opts: { maxSteps: number }
): Promise<PulsebreakEvaluationResult> {
  const config = pulsebreakProjectDefinition.compile(snapshot)
  const run = createHeadlessRun({ config, seed: 42, control: kite })
  run.store.dispatch({ type: 'runStarted' })
  const maxSteps = Math.max(0, Math.floor(opts.maxSteps))
  const steps = run.runUntil(() => ['victory', 'defeat'].includes(run.store.getState().scene), maxSteps)
  const state = run.store.getState()
  const enemiesRemaining = [...run.game.world.with('enemy')].length
  const outcome = state.scene === 'victory' ? 'passed' : state.scene === 'defeat' ? 'failed' : 'incomplete'
  const score = state.run.score + (state.run.wave - 1) * 1_000 + state.run.health + (outcome === 'passed' ? 1_000_000 : 0)
  const result: PulsebreakEvaluationResult = {
    outcome,
    score,
    metrics: {
      scene: state.scene,
      wave: state.run.wave,
      health: state.run.health,
      runScore: state.run.score,
      enemiesRemaining
    },
    steps
  }
  run.dispose()
  return result
}
