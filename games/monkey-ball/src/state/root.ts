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
import { sceneReducer } from './scene'
import { initialSession, sessionReducer, type SessionState } from './session'
import { initialSettings, settingsReducer, type SettingsState } from './settings'

export interface GameState {
  scene: SceneId
  session: SessionState
  progress: ProgressState
  settings: SettingsState
}

const PERSIST_VERSION = 1
const PROGRESS_KEY = 'monkey-ball/progress'
const SETTINGS_KEY = 'monkey-ball/settings'

const slices = combineReducers<GameState, Action>({
  scene: sceneReducer,
  session: sessionReducer,
  progress: progressReducer,
  settings: settingsReducer
})

/** Slice reducers plus the cross-slice "out of lives => game over" rule. */
export const rootReducer: Reducer<GameState, Action> = (state, action) => {
  const next = slices(state, action)
  const ranOutOfLives =
    (action.type === 'ballFell' || action.type === 'timeExpired') &&
    next.session.lives === 0
  return ranOutOfLives ? { ...next, scene: 'gameOver' } : next
}

export type GameStore = Store<GameState, Action>

export interface GameStoreOptions {
  storage?: StoragePort
}

export function createGameStore(options: GameStoreOptions = {}): GameStore {
  const storage = options.storage ?? memoryStorage()
  const savedProgress = loadPersisted(storage, PROGRESS_KEY, PERSIST_VERSION) as ProgressState | null
  const savedSettings = loadPersisted(
    storage,
    SETTINGS_KEY,
    PERSIST_VERSION
  ) as Partial<SettingsState> | null

  const initial: GameState = {
    scene: 'boot',
    session: initialSession,
    progress: savedProgress ?? initialProgress,
    settings: { ...initialSettings, ...(savedSettings ?? {}) }
  }

  const progressPersistence = createPersistence<GameState, Action>(storage, {
    key: PROGRESS_KEY,
    version: PERSIST_VERSION,
    debounceMs: 200,
    pick: (state) => state.progress
  })
  const settingsPersistence = createPersistence<GameState, Action>(storage, {
    key: SETTINGS_KEY,
    version: PERSIST_VERSION,
    debounceMs: 200,
    pick: (state) => state.settings
  })

  return createStore(rootReducer, initial, [
    progressPersistence.middleware,
    settingsPersistence.middleware
  ])
}
