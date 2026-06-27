import { describe, expect, it } from 'vitest'
import { createGameStore } from '../../src/state/root'
import { createGameOver, createLevelComplete, createPauseOverlay } from '../../src/ui/overlays'

describe('overlays', () => {
  it('pause overlay resumes the game', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'paused' })
    const view = createPauseOverlay(store)
    document.body.append(view.element)

    view.element.querySelector<HTMLButtonElement>('.pause-resume')!.click()

    expect(store.getState().scene).toBe('playing')
    view.dispose()
    expect(view.element.isConnected).toBe(false)
  })

  it('level complete shows the run summary and opens level select', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'tickedMs', ms: 7400 })
    store.dispatch({ type: 'bananaCollected', value: 3 })
    store.dispatch({ type: 'levelCompleted', levelId: 'w1-l1', timeMs: 7400, bananas: 3 })
    const view = createLevelComplete(store)
    document.body.append(view.element)

    expect(view.element.querySelector('.complete-summary')!.textContent).toBe(
      'Time 7.4s - Bananas 3'
    )
    view.element.querySelector<HTMLButtonElement>('.complete-next')!.click()
    expect(store.getState().scene).toBe('levelSelect')
    view.dispose()
    expect(view.element.isConnected).toBe(false)
  })

  it('game over retries the level', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'ballFell' })
    store.dispatch({ type: 'ballFell' })
    store.dispatch({ type: 'ballFell' })
    expect(store.getState().scene).toBe('gameOver')
    const view = createGameOver(store)
    document.body.append(view.element)

    view.element.querySelector<HTMLButtonElement>('.over-retry')!.click()

    expect(store.getState().scene).toBe('playing')
    view.dispose()
    expect(view.element.isConnected).toBe(false)
  })

  it('pause and game-over Quit buttons return to the menu', () => {
    const pausedStore = createGameStore()
    pausedStore.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    pausedStore.dispatch({ type: 'paused' })
    const pause = createPauseOverlay(pausedStore)
    document.body.append(pause.element)
    pause.element.querySelector<HTMLButtonElement>('.pause-quit')!.click()
    expect(pausedStore.getState().scene).toBe('menu')
    pause.dispose()

    const gameOverStore = createGameStore()
    gameOverStore.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    gameOverStore.dispatch({ type: 'ballFell' })
    gameOverStore.dispatch({ type: 'ballFell' })
    gameOverStore.dispatch({ type: 'ballFell' })
    const gameOver = createGameOver(gameOverStore)
    document.body.append(gameOver.element)
    gameOver.element.querySelector<HTMLButtonElement>('.over-quit')!.click()
    expect(gameOverStore.getState().scene).toBe('menu')
    gameOver.dispose()

    expect(pause.element.isConnected).toBe(false)
    expect(gameOver.element.isConnected).toBe(false)
  })
})
