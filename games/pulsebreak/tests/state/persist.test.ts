import { memoryStorage } from '@automata/engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGameStore } from '../../src/state/root'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('persisted best score', () => {
  it('persists the best score and reloads it into a fresh store', () => {
    const storage = memoryStorage()
    const first = createGameStore({ storage })
    first.dispatch({ type: 'runStarted' })
    first.dispatch({ type: 'enemyKilled', value: 777 })
    first.dispatch({ type: 'bossDefeated' })
    vi.advanceTimersByTime(300)

    const second = createGameStore({ storage })
    expect(second.getState().progress.bestScore).toBe(777)
    expect(second.getState().scene).toBe('title')
  })

  it('falls back to a zero best score on a corrupt save', () => {
    const storage = memoryStorage()
    storage.set('pulsebreak/progress', '{ not json')
    expect(createGameStore({ storage }).getState().progress.bestScore).toBe(0)
  })

  it('rejects invalid or non-finite persisted best scores', () => {
    for (const value of ['"high"', '-5', '1e999', 'null']) {
      const storage = memoryStorage()
      storage.set('pulsebreak/progress', `{"version":1,"data":{"bestScore":${value}}}`)
      expect(createGameStore({ storage }).getState().progress.bestScore).toBe(0)
    }
  })
})
