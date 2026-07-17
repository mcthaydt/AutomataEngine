import type { EvalSliceView, PackEvalHook } from '@automata/game-kit'
import { QUEST_LOG_SLICE_ID, SLOT_NAMES, type SchedulesRelationshipsPackConfig } from './config'
import { createClock, stepClock, type ClockState } from './clockCore'
import { initialWalkerPositions, stepWalker, walkerTarget, type WalkerPosition } from './scheduleCore'
import { applyQuestCompleted, createAffinities, relationshipsComplete, type Affinities } from './relationshipCore'

/** One harness tick equals one fixed simulation step for the headless clock. */
export const EVAL_TICK_DT = 1 / 60

interface EvalState {
  clock: ClockState
  positions: Record<string, WalkerPosition>
  affinities: Affinities
  seenComplete: readonly string[]
}

const questLogView = (slices?: EvalSliceView): Record<string, string> =>
  (slices?.[QUEST_LOG_SLICE_ID] as Record<string, string> | undefined) ?? {}

/**
 * Headless twin. Events do not cross the eval seam, so newly completed questLog
 * entries become equivalent questCompleted events. Completion intentionally
 * depends only on relationship state, never clock or walker progress.
 */
export function createSchedulesRelationshipsEvalHook(config: SchedulesRelationshipsPackConfig): PackEvalHook {
  return {
    packId: 'schedules-relationships',
    createState: (): EvalState => ({
      clock: createClock(),
      positions: initialWalkerPositions(config.walkers, 0),
      affinities: createAffinities(config.relationships),
      seenComplete: []
    }),
    nextTarget: () => null,
    step(state, _player, slices) {
      const evalState = state as EvalState
      const clock = stepClock(evalState.clock, EVAL_TICK_DT, config.slotSeconds).state
      const positions = Object.fromEntries(config.walkers.map((walker) => [
        walker.id,
        stepWalker(evalState.positions[walker.id]!, walkerTarget(walker, clock.slot), walker.speed, EVAL_TICK_DT)
      ]))
      const log = questLogView(slices)
      let affinities = evalState.affinities
      const seen = new Set(evalState.seenComplete)
      for (const [questId, status] of Object.entries(log)) {
        if (status !== 'complete' || seen.has(questId)) continue
        seen.add(questId)
        affinities = applyQuestCompleted(affinities, questId, config.relationships)
      }
      return { clock, positions, affinities, seenComplete: [...seen] } satisfies EvalState
    },
    complete: (state) => relationshipsComplete((state as EvalState).affinities, config.relationships),
    publishSlices: (state) => {
      const evalState = state as EvalState
      return {
        clock: { slot: evalState.clock.slot, slotName: SLOT_NAMES[evalState.clock.slot]! },
        relationships: { affinities: { ...evalState.affinities } }
      }
    }
  }
}
