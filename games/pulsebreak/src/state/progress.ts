import type { Reducer } from '@automata/engine'
import type { Action } from './actions'

/** Persisted cross-run progress. */
export interface ProgressState {
  bestScore: number
}

export const initialProgress: ProgressState = { bestScore: 0 }

/**
 * Identity reducer: the best score depends on the run slice's score, so it is
 * recorded cross-slice in the root reducer when a run ends.
 */
export const progressReducer: Reducer<ProgressState, Action> = (state) => state
