import { describe, expect, it } from 'vitest'
import { createUpgrade } from '../../src/ui/upgrade'
import { UPGRADES } from '../../src/sim/upgrades'
import { createGameStore } from '../../src/state/root'

function upgradingStore() {
  const store = createGameStore()
  store.dispatch({ type: 'runStarted' })
  store.dispatch({ type: 'waveCleared', choices: ['damage', 'fireRate', 'maxHealth'] })
  return store
}

describe('upgrade', () => {
  it('renders one button per offered choice with its label', () => {
    const store = upgradingStore()
    const view = createUpgrade(store)
    const buttons = view.element.querySelectorAll('.upgrade-choice')
    expect(buttons).toHaveLength(3)
    expect(view.element.textContent).toContain(UPGRADES.damage.label)
    expect(view.element.textContent).toContain(UPGRADES.maxHealth.label)
    view.dispose()
  })

  it('applies the chosen upgrade and returns to play', () => {
    const store = upgradingStore()
    const view = createUpgrade(store)
    const before = store.getState().run.fireRate
    view.element.querySelector<HTMLButtonElement>('[data-upgrade-id="fireRate"]')!.click()
    expect(store.getState().scene).toBe('playing')
    expect(store.getState().run.wave).toBe(2)
    expect(store.getState().run.fireRate).toBeGreaterThan(before)
    view.dispose()
    expect(view.element.isConnected).toBe(false)
  })
})
