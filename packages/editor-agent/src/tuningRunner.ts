import {
  createSeekGoalPlayer,
  runAgent,
  runTuningLoop,
  scoreFitness,
  type FitnessTarget,
  type ProviderAdapter
} from '@automata/agent-core'
import type { SceneCommand } from '@automata/contracts'
import type { EditorCore } from '@automata/editor'
import { createEditorToolHost, validateDoc } from '@automata/editor/headless'

const TUNING_SYSTEM =
  'You tune a game level for solvability. Use the tools to make small layout/tuning edits that ' +
  'keep the level valid and beatable, then stop. Prefer the smallest change that helps.'

export interface TuningState<Doc> {
  doc: Doc
  /** Cumulative commands from the original doc to this state. */
  commands: SceneCommand[]
}

export interface TuningRunOptions<Doc> {
  core: EditorCore<Doc>
  provider: ProviderAdapter
  /** The tuning instruction handed to the LLM each proposal. */
  prompt: string
  target: FitnessTarget
  /** Stop the optimizer once this score is reached. Default 1. */
  targetScore?: number
  /** Headless play step cap per scoring run. Default 3000. */
  maxSteps?: number
  maxIterations?: number
  /** Stop after this many consecutive invalid or non-improving proposals. */
  patience?: number
  /** Injected for tests; defaults to the real agent-core loop. */
  runAgentFn?: typeof runAgent
}

export interface TuningRunResult<Doc> {
  doc: Doc
  commands: SceneCommand[]
  score: number
  iterations: number
  accepted: number
}

/** Drives LLM proposals through a validate/score keep-revert loop without mutating the live editor doc. */
export async function runTuning<Doc>(opts: TuningRunOptions<Doc>): Promise<TuningRunResult<Doc>> {
  const { core, provider } = opts
  const { definition } = core
  if (!definition.play) throw new Error('this game has no test-play support')

  const play = definition.play
  const maxSteps = opts.maxSteps ?? 3000
  const runAgentFn = opts.runAgentFn ?? runAgent
  const seek = createSeekGoalPlayer()
  const targetScore = opts.targetScore ?? 1

  const score = async (state: TuningState<Doc>): Promise<number> => {
    const result = await play.runHeadlessPlay(state.doc, { maxSteps, input: seek })
    return scoreFitness(result, opts.target)
  }
  const validate = (state: TuningState<Doc>): boolean => validateDoc(definition, state.doc).exportable
  const propose = async (best: TuningState<Doc>): Promise<TuningState<Doc>> => {
    const host = createEditorToolHost({ definition, initialDoc: best.doc })
    const result = await runAgentFn({ provider, host, system: TUNING_SYSTEM, prompt: opts.prompt })
    if (result.stoppedBy !== 'end') {
      const reason = result.stoppedBy === 'max-turns' ? 'maximum turn limit' : 'provider stop'
      throw new Error(`agent stopped before completing (${reason})`)
    }
    return { doc: host.doc, commands: [...best.commands, ...host.commands] }
  }

  const loop = await runTuningLoop<TuningState<Doc>>({
    initial: { doc: core.store.getState().document.doc, commands: [] },
    propose,
    score,
    validate,
    target: targetScore,
    maxIterations: opts.maxIterations,
    patience: opts.patience
  })

  return {
    doc: loop.best.doc,
    commands: loop.best.commands,
    score: loop.bestScore,
    iterations: loop.iterations,
    accepted: loop.accepted
  }
}
