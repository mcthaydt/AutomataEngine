import { combineReducers, createStore, type Reducer, type Store } from '@automata/engine'
import type { Action, SceneId } from './actions'
import { sceneReducer } from './scene'
import { initialSession, sessionReducer, type SessionState } from './session'

export interface GameState {
  scene: SceneId
  session: SessionState
}

export const initialGameState: GameState = {
  scene: 'boot',
  session: initialSession
}

const slices = combineReducers<GameState, Action>({
  scene: sceneReducer,
  session: sessionReducer
})

/** Slice reducers plus cross-slice rules that need the whole state. */
export const rootReducer: Reducer<GameState, Action> = (state, action) => {
  const next = slices(state, action)
  const ranOutOfLives =
    (action.type === 'ballFell' || action.type === 'timeExpired') &&
    next.session.lives === 0
  return ranOutOfLives ? { ...next, scene: 'gameOver' } : next
}

export type GameStore = Store<GameState, Action>

export function createGameStore(): GameStore {
  return createStore(rootReducer, initialGameState)
}
