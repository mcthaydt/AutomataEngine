import type { Action } from './actions'

export interface LevelRecord {
  completed: boolean
  bestTimeMs: number
  maxBananas: number
}

export type ProgressState = Record<string, LevelRecord>

export const initialProgress: ProgressState = {}

export function progressReducer(state: ProgressState, action: Action): ProgressState {
  if (action.type !== 'levelCompleted') return state

  const prev = state[action.levelId]
  return {
    ...state,
    [action.levelId]: {
      completed: true,
      bestTimeMs: prev ? Math.min(prev.bestTimeMs, action.timeMs) : action.timeMs,
      maxBananas: prev ? Math.max(prev.maxBananas, action.bananas) : action.bananas
    }
  }
}
