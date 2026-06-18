import { describe, expect, it } from 'vitest'
import type { DataLoader } from '@automata/engine'
import { loadRequestedLevel, shouldMountLoadedLevel } from '../../src/scenes/levelLifecycle'
import { createGameStore } from '../../src/state/root'

describe('shouldMountLoadedLevel', () => {
  it('rejects a loaded level when the session switched to another level while loading', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'openedLevelSelect' })
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l2' })

    expect(shouldMountLoadedLevel(store.getState(), 'w1-l1', false)).toBe(false)
    expect(shouldMountLoadedLevel(store.getState(), 'w1-l2', false)).toBe(true)
  })

  it('rejects a loaded level after leaving play or when a level is already active', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })

    expect(shouldMountLoadedLevel(store.getState(), 'w1-l1', true)).toBe(false)

    store.dispatch({ type: 'openedLevelSelect' })
    expect(shouldMountLoadedLevel(store.getState(), 'w1-l1', false)).toBe(false)
  })

  it('returns to level select when the requested level fails to load', async () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'missing' })
    const loader = {
      load: async () => { throw new Error('404') }
    } as DataLoader

    await expect(loadRequestedLevel(loader, store, 'missing', false)).resolves.toBeNull()
    expect(store.getState().scene).toBe('levelSelect')
  })
})
