import { describe, expect, it } from 'vitest'
import { createTitle } from '../../src/ui/title'
import { createGameStore } from '../../src/state/root'

describe('title', () => {
  it('shows the name, instructions, and best score', () => {
    const store = createGameStore()
    store.dispatch({ type: 'runStarted' })
    store.dispatch({ type: 'enemyKilled', value: 600 })
    store.dispatch({ type: 'bossDefeated' })
    store.dispatch({ type: 'quitToTitle' })

    const view = createTitle(store)
    expect(view.element.querySelector('h1')!.textContent).toContain('PULSEBREAK')
    expect(view.element.querySelector('.title-instructions')!.textContent!.length).toBeGreaterThan(0)
    expect(view.element.querySelector('.title-best')!.textContent).toContain('600')
    view.dispose()
  })

  it('starts a run when Start is clicked', () => {
    const store = createGameStore()
    const view = createTitle(store)
    view.element.querySelector<HTMLButtonElement>('.title-start')!.click()
    expect(store.getState().scene).toBe('playing')
    view.dispose()
    expect(view.element.isConnected).toBe(false)
  })
})
