import { describe, expect, it } from 'vitest'
import { shouldMountLoadedLevel } from '../../src/scenes/levelLifecycle'
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
})
