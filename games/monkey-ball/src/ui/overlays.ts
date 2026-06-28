import { button, panel, staticView, type View } from '@automata/game-kit'
import type { GameStore } from '../state/root'

export function createPauseOverlay(store: GameStore): View {
  const element = panel('pause')
  element.append(
    button('Resume', 'pause-resume', () => store.dispatch({ type: 'resumed' })),
    button('Quit', 'pause-quit', () => store.dispatch({ type: 'quitToMenu' }))
  )
  return staticView(element)
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
  return staticView(element)
}

export function createGameOver(store: GameStore): View {
  const element = panel('game-over')
  element.append(
    button('Retry', 'over-retry', () => store.dispatch({ type: 'retried' })),
    button('Quit', 'over-quit', () => store.dispatch({ type: 'quitToMenu' }))
  )
  return staticView(element)
}
