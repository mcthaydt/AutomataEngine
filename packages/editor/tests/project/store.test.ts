import { describe, expect, it } from 'vitest'
import { createProjectEditorStore } from '../../src/project/store'
import { fakeEditorRegistration, fakeSnapshot } from '../fixtures/fakeProject'

const speedCommand = (value: number) => ({
  type: 'projectCommand' as const,
  command: { type: 'setProperty' as const, target: { kind: 'resource' as const, resourceId: 'tuning' }, pointer: '/speed', value }
})

describe('project editor store', () => {
  it('dispatches commands and tracks dirty document paths through save/undo', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    store.dispatch(speedCommand(8))
    expect(store.getState().dirtyPaths).toEqual(['resources/tuning.resource.json'])
    store.dispatch({ type: 'markSaved', paths: ['resources/tuning.resource.json'] })
    expect(store.getState().dirtyPaths).toEqual([])
    store.dispatch({ type: 'undo' })
    expect(store.getState().dirtyPaths).toEqual(['resources/tuning.resource.json'])
  })

  it('applies command batches atomically', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const before = store.getState().snapshot
    store.dispatch({
      type: 'projectCommandBatch',
      commands: [
        { type: 'setProperty', target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: 9 },
        { type: 'setProperty', target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: -1 }
      ]
    })
    expect(store.getState().snapshot).toBe(before)
  })

  it('caps the undo history at 200 entries', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    for (let i = 1; i <= 250; i++) store.dispatch(speedCommand(i))
    expect(store.getState().past.length).toBe(200)
  })

  it('supports undo/redo and exposes a typed selection', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    store.dispatch(speedCommand(8))
    store.dispatch({ type: 'undo' })
    expect((store.getState().snapshot.resources.tuning!.data as { speed: number }).speed).toBe(4)
    store.dispatch({ type: 'redo' })
    expect((store.getState().snapshot.resources.tuning!.data as { speed: number }).speed).toBe(8)

    store.dispatch({ type: 'select', selection: { kind: 'entity', sceneId: 'main', entityIds: ['box'] } })
    expect(store.getState().selection).toEqual({ kind: 'entity', sceneId: 'main', entityIds: ['box'] })
  })

  it('reconciles selection when the selected entity is removed', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    store.dispatch({ type: 'select', selection: { kind: 'entity', sceneId: 'main', entityIds: ['box'] } })
    store.dispatch({ type: 'projectCommand', command: { type: 'removeEntities', sceneId: 'main', entityIds: ['box'] } })
    expect(store.getState().selection.kind).not.toBe('entity')
  })

  it('tracks active scene and play mode', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    expect(store.getState().activeSceneId).toBe('main')
    store.dispatch({ type: 'setMode', mode: 'play' })
    expect(store.getState().mode).toBe('play')
  })

  it('performs partial markSaved and records save errors without clearing dirt', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    store.dispatch(speedCommand(8))
    store.dispatch({ type: 'projectCommand', command: { type: 'setProperty', target: { kind: 'entity', sceneId: 'main', entityId: 'box' }, pointer: '/name', value: 'Renamed' } })
    expect(store.getState().dirtyPaths.sort()).toEqual(['resources/tuning.resource.json', 'scenes/main.scene.json'])

    store.dispatch({ type: 'markSaved', paths: ['resources/tuning.resource.json'] })
    expect(store.getState().dirtyPaths).toEqual(['scenes/main.scene.json'])

    store.dispatch({ type: 'saveFailed', message: 'disk full', paths: ['scenes/main.scene.json'] })
    expect(store.getState().saveStatus).toEqual({ kind: 'error', message: 'disk full', paths: ['scenes/main.scene.json'] })
    expect(store.getState().dirtyPaths).toEqual(['scenes/main.scene.json'])
  })
})
