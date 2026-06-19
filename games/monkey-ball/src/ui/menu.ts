import type { GameStore } from '../state/root'
import { button, panel, staticView } from './dom'
import type { View } from './view'

export function createMenu(store: GameStore): View {
  const element = panel('menu')

  const title = document.createElement('h1')
  title.textContent = 'Monkey Ball'

  element.append(
    title,
    button('Play', 'menu-play', () => store.dispatch({ type: 'openedLevelSelect' }))
  )
  return staticView(element)
}
