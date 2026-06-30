import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '@automata/engine'
import { createProjectEditorStore } from '../../../src/project/store'
import { installProjectAutosave, loadProjectAutosave, projectAutosaveKey } from '../../../src/project/storage/autosave'
import { fakeEditorRegistration, fakeSnapshot } from '../../fixtures/fakeProject'

const setSpeed = (value: number) => ({
  type: 'projectCommand' as const,
  command: { type: 'setProperty' as const, target: { kind: 'resource' as const, resourceId: 'tuning' }, pointer: '/speed', value }
})

afterEach(() => vi.useRealTimers())

describe('project autosave', () => {
  it('debounces writes and flushes a pending write on stop', () => {
    vi.useFakeTimers()
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const storage = memoryStorage()
    const stop = installProjectAutosave(store, storage, { debounceMs: 100 })

    store.dispatch(setSpeed(8))
    store.dispatch(setSpeed(9))
    expect(storage.get(projectAutosaveKey('fake-demo'))).toBeNull()
    vi.advanceTimersByTime(100)
    expect(storage.get(projectAutosaveKey('fake-demo'))).not.toBeNull()

    store.dispatch(setSpeed(10))
    stop() // flushes the pending write immediately
    expect((loadProjectAutosave(storage, 'fake-demo')!.resources.tuning!.data as { speed: number }).speed).toBe(10)
  })

  it('does not write when a dispatch leaves the snapshot unchanged', () => {
    vi.useFakeTimers()
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const storage = memoryStorage()
    installProjectAutosave(store, storage, { debounceMs: 100 })

    store.dispatch({ type: 'select', selection: { kind: 'scene', sceneId: 'main' } })
    store.dispatch({ type: 'toggleInset' })
    vi.advanceTimersByTime(100)

    expect(storage.get(projectAutosaveKey('fake-demo'))).toBeNull()
  })

  it('does not re-write on stop after a debounced write already flushed', () => {
    vi.useFakeTimers()
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const storage = memoryStorage()
    const setSpy = vi.spyOn(storage, 'set')
    const stop = installProjectAutosave(store, storage, { debounceMs: 100 })

    store.dispatch(setSpeed(8))
    vi.advanceTimersByTime(100)
    expect(setSpy).toHaveBeenCalledTimes(1)

    stop()
    expect(setSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects a version mismatch on load', () => {
    const storage = memoryStorage()
    storage.set(projectAutosaveKey('p'), JSON.stringify({ version: 999, snapshot: {} }))
    expect(loadProjectAutosave(storage, 'p')).toBeNull()
  })
})
