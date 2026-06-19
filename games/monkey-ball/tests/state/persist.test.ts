import { memoryStorage } from '@automata/engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGameStore } from '../../src/state/root'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('persisted game store', () => {
  it('persists progress + settings and reloads them into a fresh store', () => {
    const storage = memoryStorage()
    const first = createGameStore({ storage })

    first.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    first.dispatch({ type: 'levelCompleted', levelId: 'w1-l1', timeMs: 8000, bananas: 2 })
    first.dispatch({ type: 'setVolume', value: 0.3 })
    vi.advanceTimersByTime(300)

    const second = createGameStore({ storage })
    expect(second.getState().progress['w1-l1']).toEqual({
      completed: true,
      bestTimeMs: 8000,
      maxBananas: 2
    })
    expect(second.getState().settings.volume).toBe(0.3)
    expect(second.getState().scene).toBe('boot')
  })

  it('falls back to defaults on corrupt or stale saves', () => {
    const storage = memoryStorage()
    storage.set('monkey-ball/progress', '{ not json')
    storage.set('monkey-ball/settings', JSON.stringify({ version: 999, data: { volume: 0.1 } }))

    const store = createGameStore({ storage })

    expect(store.getState().progress).toEqual({})
    expect(store.getState().settings.volume).toBe(0.7)
  })

  it('falls back to defaults for versioned saves with invalid shapes', () => {
    const storage = memoryStorage()
    storage.set('monkey-ball/progress', JSON.stringify({
      version: 1,
      data: {
        'w1-l1': { completed: true, bestTimeMs: 'fast', maxBananas: 2 },
        'w1-l2': null
      }
    }))
    storage.set('monkey-ball/settings', JSON.stringify({
      version: 1,
      data: { volume: 'loud', joystickSide: 'middle' }
    }))

    const store = createGameStore({ storage })

    expect(store.getState().progress).toEqual({})
    expect(store.getState().settings).toEqual({ volume: 0.7, joystickSide: 'left' })
  })
})
