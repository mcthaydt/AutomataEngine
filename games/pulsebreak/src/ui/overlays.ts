import { button, panel, staticView, type View } from '@automata/game-kit'
import type { GameStore } from '../state/root'

export function createPauseOverlay(store: GameStore): View {
  const element = panel('pause')
  const heading = document.createElement('h2')
  heading.textContent = 'PAUSED'
  element.append(
    heading,
    button('Resume', 'pause-resume', () => store.dispatch({ type: 'resumed' })),
    button('Quit to Title', 'pause-quit', () => store.dispatch({ type: 'quitToTitle' }))
  )
  return staticView(element)
}

function resultView(store: GameStore, className: string, title: string): View {
  const element = panel(className)
  const { run, progress } = store.getState()

  const heading = document.createElement('h1')
  heading.textContent = title
  const score = document.createElement('p')
  score.className = 'result-score'
  score.textContent = `SCORE ${run.score}`
  const best = document.createElement('p')
  best.className = 'result-best'
  best.textContent = `BEST ${progress.bestScore}`

  element.append(
    heading,
    score,
    best,
    button('Retry', 'result-retry', () => store.dispatch({ type: 'retried' })),
    button('Quit to Title', 'result-quit', () => store.dispatch({ type: 'quitToTitle' }))
  )
  return staticView(element)
}

export function createVictory(store: GameStore): View {
  return resultView(store, 'victory', 'VICTORY')
}

export function createDefeat(store: GameStore): View {
  return resultView(store, 'defeat', 'DEFEAT')
}
