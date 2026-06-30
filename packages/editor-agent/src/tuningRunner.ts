import {
  runAgent,
  runTuningLoop,
  type AgentRunOptions,
  type AgentRunResult,
  type ProviderAdapter
} from '@automata/agent-core'
import type { ToolHost } from '@automata/contracts'
import type { ProjectEditorCore } from '@automata/editor'
import { createProjectToolHost } from '@automata/editor/headless'
import type { ProjectCommand, ProjectSnapshot } from '@automata/project'

const TUNING_SYSTEM =
  'You tune a game project using its registered validation and evaluation adapters. ' +
  'Use project tools to make small changes, validate and evaluate them, then stop. ' +
  'Prefer the smallest change that improves the normalized score.'

export interface TuningState {
  snapshot: ProjectSnapshot
  /** Cumulative commands from the original snapshot to this state. */
  commands: ProjectCommand[]
}

export type ProjectAgentRunOptions = Omit<AgentRunOptions, 'host'> & { host: ToolHost }
export type ProjectAgentRunner = (options: ProjectAgentRunOptions) => Promise<AgentRunResult>

export interface TuningRunOptions {
  core: ProjectEditorCore
  provider: ProviderAdapter
  /** The tuning instruction handed to the provider for each proposal. */
  prompt: string
  /** Stop once evaluation reaches this score. Default 1. */
  targetScore?: number
  /** Evaluation step cap. Default 3000. */
  maxSteps?: number
  maxIterations?: number
  /** Stop after this many consecutive invalid or non-improving proposals. */
  patience?: number
  /** Injected for tests; defaults to the provider-neutral agent loop. */
  runAgentFn?: ProjectAgentRunner
}

export interface TuningRunResult {
  snapshot: ProjectSnapshot
  commands: ProjectCommand[]
  score: number
  iterations: number
  accepted: number
}

/**
 * Propose project edits in isolated hosts and retain only score improvements.
 * The live editor store is never dispatched to; approval remains a UI concern.
 */
export async function runTuning(options: TuningRunOptions): Promise<TuningRunResult> {
  const { core, provider } = options
  const { registration } = core
  if (!registration.evaluate) throw new Error('this project has no evaluation adapter')

  const maxSteps = options.maxSteps ?? 3000
  const targetScore = options.targetScore ?? 1
  const runAgentFn: ProjectAgentRunner = options.runAgentFn ?? runAgent
  const valid = (state: TuningState): boolean =>
    !registration.validate(state.snapshot).some((issue) => issue.severity === 'error')
  const score = async (state: TuningState): Promise<number> =>
    (await registration.evaluate!(state.snapshot, { maxSteps })).score
  const propose = async (best: TuningState, bestScore: number): Promise<TuningState> => {
    const host = createProjectToolHost({
      registration,
      initialSnapshot: best.snapshot,
      baseline: { score: bestScore }
    })
    // A non-'end' stop (e.g. the agent exhausting its turn budget) is a normal outcome, not a
    // fatal error: the host still holds whatever edits it made, so return them as a candidate and
    // let the loop's validate/score/patience machinery judge it. Throwing here would discard every
    // improvement already accepted on prior iterations.
    await runAgentFn({
      provider,
      host,
      system: TUNING_SYSTEM,
      prompt: options.prompt
    })
    return { snapshot: host.snapshot, commands: [...best.commands, ...host.commands] }
  }

  const initial: TuningState = {
    snapshot: core.store.getState().snapshot,
    commands: []
  }
  if (!valid(initial)) throw new Error('cannot tune an invalid project snapshot')

  const loop = await runTuningLoop<TuningState>({
    initial,
    propose,
    score,
    validate: valid,
    target: targetScore,
    maxIterations: options.maxIterations,
    patience: options.patience
  })

  return {
    snapshot: loop.best.snapshot,
    commands: loop.best.commands,
    score: loop.bestScore,
    iterations: loop.iterations,
    accepted: loop.accepted
  }
}
