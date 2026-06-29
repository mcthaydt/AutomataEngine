import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as lifecycle from '../../src/scenes/levelLifecycle'
import { createGameStore } from '../../src/state/root'
import type { SceneId } from '../../src/state/actions'
import { loadMonkeyBallProject } from '../../src/project/load'

const { loadRequestedLevel, shouldMountLoadedLevel } = lifecycle
const projectRoot = resolve(import.meta.dirname, '../../public/project')
const project = await loadMonkeyBallProject({ readText: (path) => readFile(resolve(projectRoot, path), 'utf8') })

describe('loadRequestedLevel and lifecycle', () => {
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

  it('returns to level select when the requested level is missing', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'missing' })

    expect(loadRequestedLevel(project, store, 'missing', false)).toBeNull()
    expect(store.getState().scene).toBe('levelSelect')
  })

  it('returns the selected level directly from the compiled project', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })

    expect(loadRequestedLevel(project, store, 'w1-l1', false)).toBe(project.levels['w1-l1'])
  })

  it('refuses a stale in-memory selection without dispatching', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    store.dispatch({ type: 'openedLevelSelect' })
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l2' })
    const dispatch = vi.spyOn(store, 'dispatch')

    expect(loadRequestedLevel(project, store, 'w1-l1', false)).toBeNull()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
