import type { GameStore } from '../state/root'
import type { View } from './view'

function panel(className: string): HTMLElement {
  const element = document.createElement('div')
  element.className = `overlay ${className}`
  return element
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.className = className
  element.textContent = label
  element.addEventListener('click', onClick)
  return element
}

export function createPauseOverlay(store: GameStore): View {
  const element = panel('pause')
  element.append(
    button('Resume', 'pause-resume', () => store.dispatch({ type: 'resumed' })),
    button('Quit', 'pause-quit', () => store.dispatch({ type: 'quitToMenu' }))
  )
  return {
    element,
    dispose() { element.remove() }
  }
}

export function createLevelComplete(store: GameStore): View {
  const element = panel('level-complete')
  const session = store.getState().session
  const summary = document.createElement('p')
  summary.className = 'complete-summary'
  summary.textContent = `Time ${(session.elapsedMs / 1000).toFixed(1)}s - Bananas ${session.bananas}`
  element.append(
    summary,
    button('Level Select', 'complete-next', () => store.dispatch({ type: 'openedLevelSelect' }))
  )
  return {
    element,
    dispose() { element.remove() }
  }
}

export function createGameOver(store: GameStore): View {
  const element = panel('game-over')
  element.append(
    button('Retry', 'over-retry', () => store.dispatch({ type: 'retried' })),
    button('Quit', 'over-quit', () => store.dispatch({ type: 'quitToMenu' }))
  )
  return {
    element,
    dispose() { element.remove() }
  }
}
