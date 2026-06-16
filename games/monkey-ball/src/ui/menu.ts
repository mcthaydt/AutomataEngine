import type { GameStore } from '../state/root'
import type { View } from './view'

export function createMenu(store: GameStore): View {
  const element = document.createElement('div')
  element.className = 'menu overlay'

  const title = document.createElement('h1')
  title.textContent = 'Monkey Ball'

  const play = document.createElement('button')
  play.className = 'menu-play'
  play.textContent = 'Play'
  play.addEventListener('click', () => store.dispatch({ type: 'openedLevelSelect' }))

  element.append(title, play)
  return {
    element,
    dispose() { element.remove() }
  }
}
