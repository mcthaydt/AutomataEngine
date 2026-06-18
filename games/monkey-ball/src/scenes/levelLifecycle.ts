import type { GameState } from '../state/root'

export function shouldMountLoadedLevel(
  state: GameState,
  requestedLevelId: string,
  hasActiveLevel: boolean
): boolean {
  return state.scene === 'playing' &&
    state.session.levelId === requestedLevelId &&
    !hasActiveLevel
}
