import { emptyComposition, type CompositionManifest } from '@automata/contracts'
import { resolveEvalHooks } from '@automata/pack-registry'
import type { ProjectSnapshot } from '@automata/project'
import { createInitialState, seekGoal, step, type SimControl, type SimState } from '../sim/sim'
import { compileProject } from './compiler'

export interface EvaluationResult {
  outcome: 'passed' | 'failed' | 'incomplete'
  score: number
  metrics: Record<string, number | string | boolean>
  steps: number
}

const seekPoint = (state: SimState, target: { x: number; z: number }): SimControl => {
  const dx = target.x - state.position.x
  const dz = target.z - state.position.z
  const distance = Math.hypot(dx, dz)
  if (distance < 1e-9) return { x: 0, z: 0 }
  return { x: dx / distance, z: dz / distance }
}

/** Composition-aware normalized evaluation used by editor, agent, and MCP hosts. */
export async function evaluateProject(
  snapshot: ProjectSnapshot,
  opts: { maxSteps: number },
  composition: CompositionManifest = emptyComposition(snapshot.manifest.gameId)
): Promise<EvaluationResult> {
  const compiled = compileProject(snapshot)
  const dt = 1 / 60
  const maxSteps = Math.max(0, Math.floor(opts.maxSteps))
  const hooks = resolveEvalHooks(composition)
  const hookStates = hooks.map((hook) => hook.createState())
  const hooksComplete = (): boolean => hooks.every((hook, index) => hook.complete(hookStates[index]))

  let state = createInitialState(compiled.spawn)
  let steps = 0
  while (steps < maxSteps && state.status === 'running') {
    let target: { x: number; z: number } | null = null
    for (let index = 0; index < hooks.length && target === null; index += 1) {
      target = hooks[index]!.nextTarget(hookStates[index], state.position)
    }
    const control = target ? seekPoint(state, target) : seekGoal(state, compiled.tuning)
    let next = step(state, control, dt, compiled.tuning)
    if (next.status === 'succeeded' && !hooksComplete()) next = { ...next, status: 'running' }
    state = next
    for (let index = 0; index < hooks.length; index += 1) {
      hookStates[index] = hooks[index]!.step(hookStates[index], state.position)
    }
    steps += 1
  }

  const objectivesComplete = hooksComplete()
  const outcome = state.status === 'succeeded' ? 'passed' : state.status === 'failed' ? 'failed' : 'incomplete'
  const score = outcome === 'passed' ? Math.max(0, 1 - state.elapsedS / compiled.tuning.timeLimitS) : 0
  const distanceToGoal = Math.hypot(
    compiled.tuning.goal.x - state.position.x,
    compiled.tuning.goal.z - state.position.z
  )
  return {
    outcome,
    score,
    metrics: { status: state.status, elapsedS: state.elapsedS, distanceToGoal, objectivesComplete },
    steps
  }
}
