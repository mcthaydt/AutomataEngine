import { describe, expect, it } from 'vitest'
import { createGameStore } from '../../src/state/root'
import { PLAYER } from '../../src/config'
import { initialRun } from '../../src/state/run'

describe('game store', () => {
  it('starts at the title with a fresh run and zero best score', () => {
    const store = createGameStore()
    expect(store.getState().scene).toBe('title')
    expect(store.getState().run).toEqual(initialRun)
    expect(store.getState().progress.bestScore).toBe(0)
  })

  it('runStarted enters play with a bumped runId', () => {
    const store = createGameStore()
    store.dispatch({ type: 'runStarted' })
    expect(store.getState().scene).toBe('playing')
    expect(store.getState().run.runId).toBe(1)
  })

  it('keeps playing after non-fatal damage', () => {
    const store = createGameStore()
    store.dispatch({ type: 'runStarted' })
    store.dispatch({ type: 'playerDamaged', amount: 10 })
    expect(store.getState().scene).toBe('playing')
    expect(store.getState().run.health).toBe(PLAYER.startHealth - 10)
  })

  it('transitions to defeat when integrity reaches zero', () => {
    const store = createGameStore()
    store.dispatch({ type: 'runStarted' })
    store.dispatch({ type: 'enemyKilled', value: 320 })
    store.dispatch({ type: 'playerDamaged', amount: PLAYER.startHealth })
    expect(store.getState().scene).toBe('defeat')
    expect(store.getState().progress.bestScore).toBe(320)
  })

  it('records the best score on victory', () => {
    const store = createGameStore()
    store.dispatch({ type: 'runStarted' })
    store.dispatch({ type: 'enemyKilled', value: 1500 })
    store.dispatch({ type: 'bossDefeated' })
    expect(store.getState().scene).toBe('victory')
    expect(store.getState().progress.bestScore).toBe(1500)
  })

  it('never lowers the best score with a worse run', () => {
    const store = createGameStore()
    store.dispatch({ type: 'runStarted' })
    store.dispatch({ type: 'enemyKilled', value: 1000 })
    store.dispatch({ type: 'bossDefeated' })
    store.dispatch({ type: 'retried' })
    store.dispatch({ type: 'enemyKilled', value: 50 })
    store.dispatch({ type: 'playerDamaged', amount: PLAYER.startHealth })
    expect(store.getState().scene).toBe('defeat')
    expect(store.getState().progress.bestScore).toBe(1000)
  })

  it('retries into a fresh run', () => {
    const store = createGameStore()
    store.dispatch({ type: 'runStarted' })
    store.dispatch({ type: 'playerDamaged', amount: PLAYER.startHealth })
    store.dispatch({ type: 'retried' })
    expect(store.getState().scene).toBe('playing')
    expect(store.getState().run.health).toBe(PLAYER.startHealth)
  })
})
