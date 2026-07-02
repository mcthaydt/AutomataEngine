import { button, panel, type View } from '@automata/game-kit'

import type { GameStore } from '../state/root'

export function createTitle(store: GameStore, createSeed: () => number = Date.now): View {
  const element = panel('title')

  const heading = document.createElement('h1')
  heading.textContent = 'LAST LIGHTKEEPER'

  const premise = document.createElement('p')
  premise.className = 'title-premise'
  premise.textContent = 'Keep the lighthouse alive through the storm and guide three ships to dawn.'

  const best = document.createElement('p')
  best.className = 'title-best'
  best.textContent = `BEST SCORE ${store.getState().progress.bestScore}`

  const onStart = (): void => store.dispatch({ type: 'runStarted', seed: createSeed() })
  const onInstructions = (): void => store.dispatch({ type: 'instructionsOpened' })
  const start = button('Start Night', 'title-start', onStart)
  const instructions = button('Instructions', 'title-instructions', onInstructions)

  element.append(heading, premise, best, start, instructions)

  let disposed = false
  return {
    element,
    dispose() {
      if (disposed) return
      disposed = true
      start.removeEventListener('click', onStart)
      instructions.removeEventListener('click', onInstructions)
      element.remove()
    }
  }
}
