import type { DataLoader } from '@automata/engine'
import { levelKind, type Level } from '../data/level'
import type { GameState } from '../state/root'
import type { GameStore } from '../state/root'

export function shouldMountLoadedLevel(
  state: GameState,
  requestedLevelId: string,
  hasActiveLevel: boolean
): boolean {
  return state.scene === 'playing' &&
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
