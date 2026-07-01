import {
  createStore,
  memoryStorage,
  type Middleware,
  type Reducer,
  type StoragePort,
  type Store
} from '@automata/engine'
import type { Action, SceneId } from './actions'
import { createInitialNight, type NightState } from './night'
import {
  loadProgress,
  recordCompletedRun,
  saveProgress,
  type ProgressState
} from './progress'

export interface GameState {
  scene: SceneId
  night: NightState
  progress: ProgressState
}

export type GameStore = Store<GameState, Action>

export interface GameStoreOptions {
  seed?: number
  storage?: StoragePort
}

function createRootReducer(): Reducer<GameState, Action> {
  return (state, action) => {
    switch (action.type) {
      case 'instructionsOpened':
        return state.scene === 'title' ? { ...state, scene: 'instructions' } : state
      case 'quitToTitle':
        return { ...state, scene: 'title' }
      case 'runStarted':
      case 'retried':
        return {
          ...state,
          scene: 'playing',
          night: createInitialNight(state.night.runId + 1, action.seed)
        }
      case 'paused':
        return state.scene === 'playing' ? { ...state, scene: 'paused' } : state
      case 'resumed':
        return state.scene === 'paused' ? { ...state, scene: 'playing' } : state
      case 'nightAdvanced': {
        if (state.scene !== 'playing') return state
        const terminalScene = action.night.outcome
        if (terminalScene === null) return { ...state, night: action.night }
        return {
          scene: terminalScene,
          night: action.night,
          progress: recordCompletedRun(state.progress, action.night.score, action.night.rescues)
        }
      }
    }
  }
}

function progressPersistence(storage: StoragePort): Middleware<GameState, Action> {
  return (api) => (next) => (action) => {
    const before = api.getState().progress
    next(action)
    const after = api.getState().progress
    if (after !== before) saveProgress(storage, after)
  }
}

export function createGameStore(options: GameStoreOptions = {}): GameStore {
  const storage = options.storage ?? memoryStorage()
  const initial: GameState = {
    scene: 'title',
    night: createInitialNight(0, options.seed ?? 1),
    progress: loadProgress(storage)
  }
  return createStore(createRootReducer(), initial, [progressPersistence(storage)])
}
