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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLevelRecord(value: unknown): boolean {
  return isRecord(value) &&
    value.completed === true &&
    typeof value.bestTimeMs === 'number' &&
    Number.isFinite(value.bestTimeMs) &&
    value.bestTimeMs >= 0 &&
    typeof value.maxBananas === 'number' &&
    Number.isFinite(value.maxBananas) &&
    value.maxBananas >= 0
}

function isProgressState(value: unknown): value is ProgressState {
  return isRecord(value) && Object.values(value).every(isLevelRecord)
}

function isSettingsState(value: unknown): value is SettingsState {
  return isRecord(value) &&
    typeof value.volume === 'number' &&
    Number.isFinite(value.volume) &&
    value.volume >= 0 &&
    value.volume <= 1 &&
    (value.joystickSide === 'left' || value.joystickSide === 'right')
}

export function createGameStore(options: GameStoreOptions = {}): GameStore {
  const storage = options.storage ?? memoryStorage()
  const savedProgress = loadPersisted(storage, PROGRESS_KEY, PERSIST_VERSION)
  const savedSettings = loadPersisted(
    storage,
    SETTINGS_KEY,
    PERSIST_VERSION
  )

  const initial: GameState = {
    scene: 'boot',
    session: initialSession,
    progress: isProgressState(savedProgress) ? savedProgress : initialProgress,
    settings: isSettingsState(savedSettings) ? savedSettings : initialSettings
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
