import { panel, staticView, type View } from '@automata/game-kit'
import type { UpgradeDef, UpgradeId } from '../sim/upgrades'
import type { GameStore } from '../state/root'

/** Between-wave upgrade picker: one button per offered choice. */
export function createUpgrade(store: GameStore, upgrades: Record<UpgradeId, UpgradeDef>): View {
  const element = panel('upgrade')

  const heading = document.createElement('h2')
  heading.textContent = 'WAVE CLEARED'
  const prompt = document.createElement('p')
  prompt.className = 'upgrade-prompt'
  prompt.textContent = 'Choose an upgrade'

  const choices = document.createElement('div')
  choices.className = 'upgrade-choices'
  for (const id of store.getState().run.choices) {
    const def = upgrades[id]
    const choice = document.createElement('button')
    choice.className = 'upgrade-choice'
    choice.dataset.upgradeId = id
    const label = document.createElement('span')
    label.className = 'upgrade-label'
    label.textContent = def.label
    const desc = document.createElement('span')
    desc.className = 'upgrade-desc'
    desc.textContent = def.description
    choice.append(label, desc)
    choice.addEventListener('click', () => store.dispatch({ type: 'upgradeChosen', id }))
    choices.append(choice)
  }

  element.append(heading, prompt, choices)
  return staticView(element)
}
