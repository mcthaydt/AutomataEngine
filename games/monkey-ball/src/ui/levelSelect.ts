import type { WorldsManifest } from '../data/level'
import type { GameStore } from '../state/root'
import { isLevelUnlocked, levelOrder } from '../state/unlocks'
import type { View } from './view'

export function createLevelSelect(store: GameStore, manifest: WorldsManifest): View {
  const element = document.createElement('div')
  element.className = 'level-select overlay'
  const progress = store.getState().progress

  for (const id of levelOrder(manifest)) {
    const unlocked = isLevelUnlocked(manifest, progress, id)
    const best = progress[id]?.bestTimeMs
    const button = document.createElement('button')
    button.className = 'level-button'
    button.dataset.levelId = id
    button.disabled = !unlocked
    button.textContent = !unlocked
      ? `${id} (locked)`
      : best !== undefined ? `${id} (${(best / 1000).toFixed(1)}s)` : id
    if (unlocked) {
      button.addEventListener('click', () => store.dispatch({ type: 'levelStarted', levelId: id }))
    }
    element.append(button)
  }

  const back = document.createElement('button')
  back.className = 'level-back'
  back.textContent = 'Back'
  back.addEventListener('click', () => store.dispatch({ type: 'openedMenu' }))
  element.append(back)

  return {
    element,
    dispose() { element.remove() }
  }
}
