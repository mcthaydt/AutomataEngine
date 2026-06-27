import type { GameStore } from '../state/root'
import { button, panel, staticView } from './dom'
import type { View } from './view'

const INSTRUCTIONS =
  'Move with WASD / arrows or the on-screen stick. Your drone auto-fires at the ' +
  'nearest enemy. Survive five waves, pick an upgrade between each, and break the ' +
  'boss on wave five.'

export function createTitle(store: GameStore): View {
  const element = panel('title')

  const heading = document.createElement('h1')
  heading.textContent = 'PULSEBREAK'

  const tagline = document.createElement('p')
  tagline.className = 'title-tagline'
  tagline.textContent = 'Neon arena survival'

  const instructions = document.createElement('p')
  instructions.className = 'title-instructions'
  instructions.textContent = INSTRUCTIONS

  const best = document.createElement('p')
  best.className = 'title-best'
  best.textContent = `BEST ${store.getState().progress.bestScore}`

  element.append(
    heading,
    tagline,
    instructions,
    best,
    button('Start Run', 'title-start', () => store.dispatch({ type: 'runStarted' }))
  )
  return staticView(element)
}
