import { button, panel, type View } from '@automata/game-kit'

import { nightDefinition } from '../data/night'
import { calculateScoreBreakdown } from '../sim/score'
import type { GameStore } from '../state/root'

interface OwnedButton {
  element: HTMLButtonElement
  handler: () => void
}

function ownedButton(label: string, className: string, handler: () => void): OwnedButton {
  return { element: button(label, className, handler), handler }
}

function ownedView(element: HTMLElement, buttons: readonly OwnedButton[]): View {
  let disposed = false
  return {
    element,
    dispose() {
      if (disposed) return
      disposed = true
      for (const owned of buttons) owned.element.removeEventListener('click', owned.handler)
      element.remove()
    }
  }
}

export function createPauseOverlay(
  store: GameStore,
  createSeed: () => number = Date.now
): View {
  const element = panel('pause')
  const heading = document.createElement('h1')
  heading.textContent = 'STORM PAUSED'

  const resume = ownedButton('Resume', 'pause-resume', () => store.dispatch({ type: 'resumed' }))
  const restart = ownedButton('Restart Night', 'pause-restart', () => {
    store.dispatch({ type: 'retried', seed: createSeed() })
  })
  const title = ownedButton('Return to Title', 'pause-title', () => {
    store.dispatch({ type: 'quitToTitle' })
  })

  element.append(heading, resume.element, restart.element, title.element)
  return ownedView(element, [resume, restart, title])
}

function scoreLine(key: string, label: string, value: number): HTMLLIElement {
  const line = document.createElement('li')
  line.dataset.line = key
  line.textContent = `${label} ${value}`
  return line
}

function createResult(
  store: GameStore,
  className: string,
  headingText: string,
  createSeed: () => number
): View {
  const element = panel(`result ${className}`)
  const { night, progress } = store.getState()
  const breakdown = calculateScoreBreakdown(night, nightDefinition)

  const heading = document.createElement('h1')
  heading.textContent = headingText
  const reason = document.createElement('p')
  reason.className = 'result-reason'
  reason.textContent = night.terminalReason ?? 'The night has ended.'

  const lines = document.createElement('ul')
  lines.className = 'result-breakdown'
  lines.append(
    scoreLine('rescues', 'Ship rescues', breakdown.rescuePoints),
    scoreLine('integrity', 'Lighthouse integrity', breakdown.integrityBonus),
    scoreLine('outage', 'Power outage', breakdown.outagePenalty),
    scoreLine('efficiency', 'Generator efficiency', breakdown.efficiencyBonus)
  )
  const total = document.createElement('p')
  total.className = 'result-total'
  total.textContent = `TOTAL ${breakdown.total}`
  const best = document.createElement('p')
  best.className = 'result-best'
  best.textContent = `BEST ${progress.bestScore}`

  const retry = ownedButton('Keep Another Watch', 'result-retry', () => {
    store.dispatch({ type: 'retried', seed: createSeed() })
  })
  const title = ownedButton('Return to Title', 'result-title', () => {
    store.dispatch({ type: 'quitToTitle' })
  })
  element.append(heading, reason, lines, total, best, retry.element, title.element)
  return ownedView(element, [retry, title])
}

export function createVictory(store: GameStore, createSeed: () => number = Date.now): View {
  return createResult(store, 'victory', 'DAWN', createSeed)
}

export function createDefeat(store: GameStore, createSeed: () => number = Date.now): View {
  return createResult(store, 'defeat', 'LIGHT EXTINGUISHED', createSeed)
}
