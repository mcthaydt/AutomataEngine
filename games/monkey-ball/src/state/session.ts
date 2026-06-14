import type { Action } from './actions'

export const START_LIVES = 3

export interface SessionState {
  levelId: string | null
  lives: number
  bananas: number
  elapsedMs: number
  /** Bumped whenever the level world must be rebuilt (start, fall, retry). */
  runId: number
}

export const initialSession: SessionState = {
  levelId: null, lives: START_LIVES, bananas: 0, elapsedMs: 0, runId: 0
}

export function sessionReducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'levelStarted':
      return {
        levelId: action.levelId, lives: START_LIVES,
        bananas: 0, elapsedMs: 0, runId: state.runId + 1
      }
    case 'retried':
      return { ...state, lives: START_LIVES, bananas: 0, elapsedMs: 0, runId: state.runId + 1 }
    case 'ballFell':
    case 'timeExpired':
      return {
        ...state, lives: Math.max(0, state.lives - 1),
        bananas: 0, elapsedMs: 0, runId: state.runId + 1
      }
    case 'tickedMs':
      return { ...state, elapsedMs: state.elapsedMs + action.ms }
    case 'bananaCollected':
      return { ...state, bananas: state.bananas + action.value }
    default:
      return state
  }
}
