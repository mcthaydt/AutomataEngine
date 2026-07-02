import { button, panel, type View } from '@automata/game-kit'

import type { GameStore } from '../state/root'

const CONTROLS = [
  ['A / D or arrows', 'Move'],
  ['W / S or arrows', 'Climb or aim the beacon'],
  ['E / Space', 'Interact, operate, or repair'],
  ['Q', 'Take, carry, or drop an item'],
  ['Escape / P', 'Pause or resume']
] as const

const RESCUE_LOOP = [
  'Hear the distress call.',
  'Reach the powered radio and acknowledge it.',
  'Hold the radio controls to identify the bearing.',
  'Route power to the beacon.',
  'Aim the beacon at the revealed bearing.',
  'Hold the light until the ship reaches rescue.'
] as const

export function createInstructions(store: GameStore): View {
  const element = panel('instructions')
  const heading = document.createElement('h1')
  heading.textContent = 'KEEPER HANDBOOK'

  const controlsHeading = document.createElement('h2')
  controlsHeading.textContent = 'Controls'
  const controls = document.createElement('dl')
  controls.className = 'instructions-controls'
  for (const [keys, action] of CONTROLS) {
    const term = document.createElement('dt')
    term.textContent = keys
    const detail = document.createElement('dd')
    detail.textContent = action
    controls.append(term, detail)
  }

  const loopHeading = document.createElement('h2')
  loopHeading.textContent = 'Six-step rescue loop'
  const loop = document.createElement('ol')
  loop.className = 'rescue-loop'
  for (const text of RESCUE_LOOP) {
    const step = document.createElement('li')
    step.textContent = text
    loop.append(step)
  }

  const onBack = (): void => store.dispatch({ type: 'quitToTitle' })
  const back = button('Back to Title', 'instructions-back', onBack)
  element.append(heading, controlsHeading, controls, loopHeading, loop, back)

  let disposed = false
  return {
    element,
    dispose() {
      if (disposed) return
      disposed = true
      back.removeEventListener('click', onBack)
      element.remove()
    }
  }
}
