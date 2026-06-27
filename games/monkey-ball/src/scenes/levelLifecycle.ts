import type { DataLoader } from '@automata/engine'
import { levelKind, type Level } from '../data/level'
import type { GameState } from '../state/root'
import type { GameStore } from '../state/root'
import type { SceneId } from '../state/actions'

export type LevelScene = 'playing' | 'paused' | 'levelComplete' | 'gameOver'
export type LevelSessionAction = 'enter' | 'leave' | 'keep' | 'none'

const LEVEL_SCENES = new Set<SceneId>(['playing', 'paused', 'levelComplete', 'gameOver'])

/** Decide resource ownership from a typed scene transition and current load state. */
export function levelSessionAction(
  from: SceneId | null,
  to: SceneId | null,
  hasActive: boolean,
  hasPending: boolean
): LevelSessionAction {
  const hasSession = hasActive || hasPending
  if (to === 'playing' && !hasSession) return 'enter'
  if (!hasSession) return 'none'
  if (to === null) return 'leave'
  if (from !== null && LEVEL_SCENES.has(from) && !LEVEL_SCENES.has(to)) return 'leave'
  if (LEVEL_SCENES.has(to)) return 'keep'
  return 'none'
}

export function shouldMountLoadedLevel(
  state: GameState,
  requestedLevelId: string,
  hasActiveLevel: boolean
): boolean {
  return LEVEL_SCENES.has(state.scene) &&
    state.session.levelId === requestedLevelId &&
    !hasActiveLevel
}

export async function loadRequestedLevel(
  loader: DataLoader,
  store: GameStore,
  requestedLevelId: string,
  hasActiveLevel: boolean
): Promise<Level | null> {
  try {
    const level = await loader.load(levelKind, `/data/levels/${requestedLevelId}.json`)
    return shouldMountLoadedLevel(store.getState(), requestedLevelId, hasActiveLevel) ? level : null
  } catch {
    if (shouldMountLoadedLevel(store.getState(), requestedLevelId, hasActiveLevel)) {
      store.dispatch({ type: 'openedLevelSelect' })
    }
    return null
  }
}
