import { describe, expect, it } from 'vitest'
import { memoryStorage } from '@automata/engine'
import { createGameStore } from '../../src/state/root'

describe('Last Lightkeeper game store', () => {
  it('starts at title with a fresh unstarted night', () => {
    const store = createGameStore({ seed: 42 })
    expect(store.getState()).toMatchObject({
      scene: 'title',
      night: { runId: 0, seed: 42, timeS: 0 },
      progress: { bestScore: 0, bestRescues: 0, completedRuns: 0 }
    })
  })

  it('moves through instructions and back to title', () => {
    const store = createGameStore()
    store.dispatch({ type: 'instructionsOpened' })
    expect(store.getState().scene).toBe('instructions')
    store.dispatch({ type: 'quitToTitle' })
    expect(store.getState().scene).toBe('title')
  })

  it('starts and retries fresh seeded runs with monotonic ids', () => {
    const store = createGameStore({ seed: 7 })
    store.dispatch({ type: 'runStarted', seed: 11 })
    expect(store.getState()).toMatchObject({ scene: 'playing', night: { runId: 1, seed: 11 } })
    store.dispatch({ type: 'nightAdvanced', night: { ...store.getState().night, timeS: 100 } })
    store.dispatch({ type: 'retried', seed: 12 })
    expect(store.getState()).toMatchObject({ scene: 'playing', night: { runId: 2, seed: 12, timeS: 0 } })
  })

  it('pauses and resumes only from valid scenes', () => {
    const store = createGameStore()
    store.dispatch({ type: 'paused' })
    expect(store.getState().scene).toBe('title')
    store.dispatch({ type: 'runStarted', seed: 1 })
    store.dispatch({ type: 'paused' })
    expect(store.getState().scene).toBe('paused')
    store.dispatch({ type: 'resumed' })
    expect(store.getState().scene).toBe('playing')
  })

  it('transitions terminal nights and persists best progress', () => {
    const storage = memoryStorage()
    const store = createGameStore({ storage })
    store.dispatch({ type: 'runStarted', seed: 1 })
    store.dispatch({
      type: 'nightAdvanced',
      night: { ...store.getState().night, outcome: 'victory', score: 3200, rescues: 4 }
    })
    expect(store.getState().scene).toBe('victory')
    expect(store.getState().progress).toEqual({ bestScore: 3200, bestRescues: 4, completedRuns: 1 })

    const reloaded = createGameStore({ storage })
    expect(reloaded.getState().progress).toEqual(store.getState().progress)
  })

  it('does not record the same terminal run twice', () => {
    const store = createGameStore()
    store.dispatch({ type: 'runStarted', seed: 1 })
    const terminal = { ...store.getState().night, outcome: 'defeat' as const, score: 50, rescues: 1 }
    store.dispatch({ type: 'nightAdvanced', night: terminal })
    store.dispatch({ type: 'nightAdvanced', night: terminal })
    expect(store.getState().progress.completedRuns).toBe(1)
  })
})
