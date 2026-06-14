import { describe, expect, it } from 'vitest'
import { createGameStore } from '../../src/state/root'

describe('game store', () => {
  it('starts at the boot scene with a fresh session', () => {
    const store = createGameStore()
    expect(store.getState().scene).toBe('boot')
    expect(store.getState().session).toEqual({
      levelId: null, lives: 3, bananas: 0, elapsedMs: 0, runId: 0
    })
  })

  it('levelStarted enters playing with a reset session and bumped runId', () => {
    const store = createGameStore()
    store.dispatch({ type: 'bananaCollected', value: 2 })
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    expect(store.getState().scene).toBe('playing')
    expect(store.getState().session).toEqual({
      levelId: 'w1-l1', lives: 3, bananas: 0, elapsedMs: 0, runId: 1
    })
  })

  it('tickedMs and bananaCollected accumulate during a run', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'tickedMs', ms: 16 })
    store.dispatch({ type: 'tickedMs', ms: 16 })
    store.dispatch({ type: 'bananaCollected', value: 1 })
    expect(store.getState().session.elapsedMs).toBe(32)
    expect(store.getState().session.bananas).toBe(1)
  })

  it('ballFell costs a life, resets the run, and stays playing', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'tickedMs', ms: 500 })
    store.dispatch({ type: 'bananaCollected', value: 1 })
    store.dispatch({ type: 'ballFell' })
    expect(store.getState().scene).toBe('playing')
    expect(store.getState().session).toEqual({
      levelId: 'w1-l1', lives: 2, bananas: 0, elapsedMs: 0, runId: 2
    })
  })

  it('timeExpired is treated like a fall', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'timeExpired' })
    expect(store.getState().session.lives).toBe(2)
    expect(store.getState().session.runId).toBe(2)
  })

  it('falling with the last life transitions to gameOver', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'ballFell' })
    store.dispatch({ type: 'ballFell' })
    expect(store.getState().scene).toBe('playing')
    store.dispatch({ type: 'ballFell' })
    expect(store.getState().scene).toBe('gameOver')
    expect(store.getState().session.lives).toBe(0)
  })

  it('retried restores lives and re-enters playing', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'ballFell' })
    store.dispatch({ type: 'ballFell' })
    store.dispatch({ type: 'ballFell' })
    store.dispatch({ type: 'retried' })
    expect(store.getState().scene).toBe('playing')
    expect(store.getState().session.lives).toBe(3)
    expect(store.getState().session.levelId).toBe('w1-l1')
  })

  it('levelCompleted enters levelComplete and leaves the session snapshot intact', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'tickedMs', ms: 12_000 })
    store.dispatch({ type: 'bananaCollected', value: 1 })
    store.dispatch({ type: 'levelCompleted', levelId: 'w1-l1', timeMs: 12_000, bananas: 1 })
    expect(store.getState().scene).toBe('levelComplete')
    expect(store.getState().session.elapsedMs).toBe(12_000)
    expect(store.getState().session.bananas).toBe(1)
  })
})
