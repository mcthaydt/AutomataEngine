import { button, panel, staticView, type View } from '@automata/game-kit'
import type { WorldsManifest } from '../data/level'
import type { GameStore } from '../state/root'
import { isLevelUnlocked, levelOrder } from '../state/unlocks'

export function createLevelSelect(store: GameStore, manifest: WorldsManifest): View {
  const element = panel('level-select')
  const progress = store.getState().progress

  for (const id of levelOrder(manifest)) {
    const unlocked = isLevelUnlocked(manifest, progress, id)
    const best = progress[id]?.bestTimeMs
    const level = document.createElement('button')
    level.className = 'level-button'
    level.dataset.levelId = id
    level.disabled = !unlocked
    level.textContent = !unlocked
      ? `${id} (locked)`
      : best !== undefined ? `${id} (${(best / 1000).toFixed(1)}s)` : id
    if (unlocked) {
      level.addEventListener('click', () => store.dispatch({ type: 'levelStarted', levelId: id }))
    }
    element.append(level)
  }

  element.append(button('Back', 'level-back', () => store.dispatch({ type: 'openedMenu' })))
  return staticView(element)
}
