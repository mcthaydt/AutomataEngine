import type { Level } from '../project/types'
import type { CompiledMonkeyBallProject } from '../project/types'
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

export function loadRequestedLevel(
  project: CompiledMonkeyBallProject,
  store: GameStore,
  requestedLevelId: string,
  hasActiveLevel: boolean
): Level | null {
  if (!shouldMountLoadedLevel(store.getState(), requestedLevelId, hasActiveLevel)) return null
  const level = project.levels[requestedLevelId]
  if (!level) {
    store.dispatch({ type: 'openedLevelSelect' })
    return null
  }
  return level
}
