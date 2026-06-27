import { describe, expect, it } from 'vitest'
import { createDefeat, createPauseOverlay, createVictory } from '../../src/ui/overlays'
import { createGameStore, type GameStore } from '../../src/state/root'

function endedStore(kind: 'victory' | 'defeat'): GameStore {
  const store = createGameStore()
  store.dispatch({ type: 'runStarted' })
  store.dispatch({ type: 'enemyKilled', value: 500 })
  if (kind === 'victory') store.dispatch({ type: 'bossDefeated' })
  else store.dispatch({ type: 'playerDamaged', amount: 9999 })
  return store
}

describe('overlays', () => {
  it('pause resumes the run', () => {
    const store = createGameStore()
    store.dispatch({ type: 'runStarted' })
    store.dispatch({ type: 'paused' })
    const view = createPauseOverlay(store)
    view.element.querySelector<HTMLButtonElement>('.pause-resume')!.click()
    expect(store.getState().scene).toBe('playing')
    view.dispose()
    expect(view.element.isConnected).toBe(false)
  })

  it('pause can quit to the title', () => {
    const store = createGameStore()
    store.dispatch({ type: 'runStarted' })
    store.dispatch({ type: 'paused' })
    const view = createPauseOverlay(store)
    view.element.querySelector<HTMLButtonElement>('.pause-quit')!.click()
    expect(store.getState().scene).toBe('title')
    view.dispose()
  })

  it('victory shows the score and best, and retries', () => {
    const store = endedStore('victory')
    const view = createVictory(store)
    expect(view.element.textContent).toContain('VICTORY')
    expect(view.element.querySelector('.result-score')!.textContent).toContain('500')
    expect(view.element.querySelector('.result-best')!.textContent).toContain('500')
    view.element.querySelector<HTMLButtonElement>('.result-retry')!.click()
    expect(store.getState().scene).toBe('playing')
    view.dispose()
  })

  it('defeat shows the score and can quit to the title', () => {
    const store = endedStore('defeat')
    expect(store.getState().scene).toBe('defeat')
    const view = createDefeat(store)
    expect(view.element.textContent).toContain('DEFEAT')
    expect(view.element.querySelector('.result-score')!.textContent).toContain('500')
    view.element.querySelector<HTMLButtonElement>('.result-quit')!.click()
    expect(store.getState().scene).toBe('title')
    view.dispose()
    expect(view.element.isConnected).toBe(false)
  })
})
