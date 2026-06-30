import { describe, expect, it } from 'vitest'
import type { WorldsManifest } from '../../src/project/legacyTypes'
import { createGameStore } from '../../src/state/root'
import { createLevelSelect } from '../../src/ui/levelSelect'

const manifest: WorldsManifest = {
  worlds: [{ id: 'w1', name: 'One', levels: ['w1-l1', 'w1-l2'] }]
}

describe('createLevelSelect', () => {
  it('enables only unlocked levels and starts the chosen one', () => {
    const store = createGameStore()
    const view = createLevelSelect(store, manifest)
    const buttons = view.element.querySelectorAll<HTMLButtonElement>('.level-button')

    expect(buttons[0]!.disabled).toBe(false)
    expect(buttons[1]!.disabled).toBe(true)
    buttons[0]!.click()
    expect(store.getState().scene).toBe('playing')
    expect(store.getState().session.levelId).toBe('w1-l1')
  })

  it('shows best time for completed levels and Back returns to the menu', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'levelCompleted', levelId: 'w1-l1', timeMs: 7400, bananas: 1 })
    store.dispatch({ type: 'openedLevelSelect' })
    const view = createLevelSelect(store, manifest)

    expect(view.element.querySelector('.level-button')!.textContent).toContain('7.4s')
    view.element.querySelector<HTMLButtonElement>('.level-back')!.click()
    expect(store.getState().scene).toBe('menu')
  })
})
