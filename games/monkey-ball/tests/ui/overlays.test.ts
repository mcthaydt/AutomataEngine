import { describe, expect, it } from 'vitest'
import { createGameStore } from '../../src/state/root'
import { createGameOver, createLevelComplete, createPauseOverlay } from '../../src/ui/overlays'

describe('overlays', () => {
  it('pause overlay resumes the game', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'paused' })
    const view = createPauseOverlay(store)

    view.element.querySelector<HTMLButtonElement>('.pause-resume')!.click()

    expect(store.getState().scene).toBe('playing')
  })

  it('level complete shows the run summary and opens level select', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'tickedMs', ms: 7400 })
    store.dispatch({ type: 'bananaCollected', value: 3 })
    store.dispatch({ type: 'levelCompleted', levelId: 'w1-l1', timeMs: 7400, bananas: 3 })
    const view = createLevelComplete(store)

    expect(view.element.querySelector('.complete-summary')!.textContent).toBe(
      'Time 7.4s - Bananas 3'
    )
    view.element.querySelector<HTMLButtonElement>('.complete-next')!.click()
    expect(store.getState().scene).toBe('levelSelect')
  })

  it('game over retries the level', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'ballFell' })
    store.dispatch({ type: 'ballFell' })
    store.dispatch({ type: 'ballFell' })
    expect(store.getState().scene).toBe('gameOver')
    const view = createGameOver(store)

    view.element.querySelector<HTMLButtonElement>('.over-retry')!.click()

    expect(store.getState().scene).toBe('playing')
  })
})
