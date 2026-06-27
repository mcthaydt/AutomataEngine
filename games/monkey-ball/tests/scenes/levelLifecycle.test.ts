import { describe, expect, it, vi } from 'vitest'
import { parseData, type DataLoader } from '@automata/engine'
import * as lifecycle from '../../src/scenes/levelLifecycle'
import { levelKind } from '../../src/data/level'
import { createGameStore } from '../../src/state/root'
import type { SceneId } from '../../src/state/actions'
import { readDataFile } from '../helpers/data'

const { loadRequestedLevel, shouldMountLoadedLevel } = lifecycle
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')

describe('shouldMountLoadedLevel', () => {
  it('classifies transitions for one retained level session', () => {
    type LevelSessionAction = (
      from: SceneId | null,
      to: SceneId | null,
      hasActive: boolean,
      hasPending: boolean
    ) => 'enter' | 'leave' | 'keep' | 'none'
    const levelSessionAction = (
      lifecycle as unknown as { levelSessionAction?: LevelSessionAction }
    ).levelSessionAction
    expect(typeof levelSessionAction).toBe('function')
    if (!levelSessionAction) return

    expect(levelSessionAction('playing', 'paused', true, false)).toBe('keep')
    expect(levelSessionAction('paused', 'playing', true, false)).toBe('keep')
    expect(levelSessionAction('levelComplete', 'levelSelect', true, false)).toBe('leave')
    expect(levelSessionAction('gameOver', 'menu', true, false)).toBe('leave')
    expect(levelSessionAction('levelSelect', 'playing', false, false)).toBe('enter')
    expect(levelSessionAction('paused', 'playing', false, false)).toBe('enter')
    expect(levelSessionAction('playing', null, false, true)).toBe('leave')
  })

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

  it('returns a successfully loaded current level', async () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: level.id })
    const loader = { load: async () => level } as unknown as DataLoader

    await expect(loadRequestedLevel(loader, store, level.id, false)).resolves.toBe(level)
  })

  it('ignores a failed stale request without dispatching', async () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'stale' })
    let reject!: (error: Error) => void
    const loader = {
      load: () => new Promise((_resolve, rejectPromise) => { reject = rejectPromise })
    } as unknown as DataLoader
    const pending = loadRequestedLevel(loader, store, 'stale', false)
    store.dispatch({ type: 'openedMenu' })
    const dispatch = vi.spyOn(store, 'dispatch')

    reject(new Error('404'))

    await expect(pending).resolves.toBeNull()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
