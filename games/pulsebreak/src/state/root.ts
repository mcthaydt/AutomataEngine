import {
  combineReducers,
  createPersistence,
  createStore,
  loadPersisted,
  memoryStorage,
  type Reducer,
  type StoragePort,
  type Store
} from '@automata/engine'
import type { Action, SceneId } from './actions'
import { initialProgress, progressReducer, type ProgressState } from './progress'
import { initialRun, runReducer, type RunState } from './run'
import { sceneReducer } from './scene'

export interface GameState {
  scene: SceneId
  run: RunState
  progress: ProgressState
}

const PERSIST_VERSION = 1
const PROGRESS_KEY = 'pulsebreak/progress'

const slices = combineReducers<GameState, Action>({
  scene: sceneReducer,
  run: runReducer,
  progress: progressReducer
})

/** Slice reducers plus cross-slice rules: out-of-integrity defeat + best score. */
export const rootReducer: Reducer<GameState, Action> = (state, action) => {
  let next = slices(state, action)
  if (next.run.health <= 0 && next.scene === 'playing') {
    next = { ...next, scene: 'defeat' }
  }
  const endedRun = next.scene !== state.scene && (next.scene === 'victory' || next.scene === 'defeat')
  if (endedRun && next.run.score > next.progress.bestScore) {
    next = { ...next, progress: { ...next.progress, bestScore: next.run.score } }
  }
  return next
}

export type GameStore = Store<GameState, Action>

export interface GameStoreOptions {
  storage?: StoragePort
}

function isProgressState(value: unknown): value is ProgressState {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    typeof (value as ProgressState).bestScore === 'number' &&
    Number.isFinite((value as ProgressState).bestScore) &&
    (value as ProgressState).bestScore >= 0
}

export function createGameStore(options: GameStoreOptions = {}): GameStore {
  const storage = options.storage ?? memoryStorage()
  const saved = loadPersisted(storage, PROGRESS_KEY, PERSIST_VERSION)

  const initial: GameState = {
    scene: 'title',
    run: initialRun,
    progress: isProgressState(saved) ? saved : initialProgress
  }

  const persistence = createPersistence<GameState, Action>(storage, {
    key: PROGRESS_KEY,
    version: PERSIST_VERSION,
    debounceMs: 200,
    pick: (state) => state.progress
  })

  return createStore(rootReducer, initial, [persistence.middleware])
}
