import { describe, expect, it } from 'vitest'
import { projectFileDocuments } from '@automata/project'
import { createProjectEditorStore, selectActiveScene, selectProjectSnapshot } from '../../src/project/store'
import { registerEditorProject } from '../../src/project/registration'
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
    store.dispatch({ type: 'markSaved', paths: ['resources/tuning.resource.json'], snapshot: store.getState().snapshot })
    expect(store.getState().dirtyPaths).toEqual([])
    store.dispatch({ type: 'undo' })
    expect(store.getState().dirtyPaths).toEqual(['resources/tuning.resource.json'])
  })

  it('markAllDirty dirties every document path until saved', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    store.dispatch({ type: 'markAllDirty' })
    const state = store.getState()
    expect(new Set(state.dirtyPaths)).toEqual(new Set(projectFileDocuments(state.snapshot).map((doc) => doc.path)))

    store.dispatch({ type: 'markSaved', paths: state.dirtyPaths, snapshot: state.snapshot })
    expect(store.getState().dirtyPaths).toEqual([])
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

    store.dispatch({ type: 'markSaved', paths: ['resources/tuning.resource.json'], snapshot: store.getState().snapshot })
    expect(store.getState().dirtyPaths).toEqual(['scenes/main.scene.json'])

    store.dispatch({ type: 'saveFailed', message: 'disk full', paths: ['scenes/main.scene.json'] })
    expect(store.getState().saveStatus).toEqual({ kind: 'error', message: 'disk full', paths: ['scenes/main.scene.json'] })
    expect(store.getState().dirtyPaths).toEqual(['scenes/main.scene.json'])
  })

  it('records a bundle export as durable persistence when it is the save target', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    store.dispatch(speedCommand(8))

    store.dispatch({ type: 'markExported', snapshot: store.getState().snapshot })

    expect(store.getState().dirtyPaths).toEqual([])
    expect(store.getState().saveStatus).toEqual({ kind: 'exported' })
  })

  it('keeps folder dirt when a bundle export is only a side artifact', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    store.dispatch(speedCommand(8))

    store.dispatch({ type: 'markExported' })

    expect(store.getState().dirtyPaths).toEqual(['resources/tuning.resource.json'])
    expect(store.getState().saveStatus).toEqual({ kind: 'exported' })
  })

  it('marks the saved snapshot clean, not edits made during an async save', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    store.dispatch(speedCommand(8))
    const inFlight = store.getState().snapshot
    store.dispatch(speedCommand(9))

    store.dispatch({ type: 'markSaved', paths: ['resources/tuning.resource.json'], snapshot: inFlight })

    expect(store.getState().dirtyPaths).toEqual(['resources/tuning.resource.json'])
  })

  it('recovers a snapshot as dirty working state against the saved baseline', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const recovered = fakeSnapshot()
    ;(recovered.resources.tuning!.data as { speed: number }).speed = 99

    store.dispatch({ type: 'recoverSnapshot', snapshot: recovered })

    expect((store.getState().snapshot.resources.tuning!.data as { speed: number }).speed).toBe(99)
    expect((store.getState().savedSnapshot.resources.tuning!.data as { speed: number }).speed).toBe(4)
    expect(store.getState().dirtyPaths).toContain('resources/tuning.resource.json')
  })

  it('reconciles the active scene when it is removed', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const scene2 = { formatVersion: 1 as const, id: 'two', name: 'Two', entities: [] }
    store.dispatch({ type: 'projectCommand', command: { type: 'addScene', scene: scene2, path: 'scenes/two.scene.json' } })
    store.dispatch({ type: 'setActiveScene', sceneId: 'two' })
    expect(store.getState().activeSceneId).toBe('two')

    store.dispatch({ type: 'projectCommand', command: { type: 'removeScene', sceneId: 'two' } })

    expect(store.getState().activeSceneId).toBe('main')
    expect(selectActiveScene(store.getState())).toBeDefined()
  })

  it('accepts registered input and ignores no-op commands or empty batches', () => {
    const store = createProjectEditorStore(registerEditorProject(fakeEditorRegistration), fakeSnapshot())
    const before = store.getState()
    store.dispatch(speedCommand(4))
    expect(store.getState()).toBe(before)
    store.dispatch({ type: 'projectCommandBatch', commands: [] })
    expect(store.getState()).toBe(before)
  })

  it('loads snapshots and handles empty undo/redo histories', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    const before = store.getState()
    store.dispatch({ type: 'undo' })
    store.dispatch({ type: 'redo' })
    expect(store.getState()).toBe(before)

    const loaded = fakeSnapshot()
    loaded.manifest.id = 'loaded'
    store.dispatch({ type: 'loadSnapshot', snapshot: loaded })
    expect(store.getState()).toMatchObject({ snapshot: loaded, savedSnapshot: loaded, dirtyPaths: [], past: [], future: [] })
  })

  it('tracks manifest/scene dirt and marks each document kind saved', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    store.dispatch({ type: 'projectCommand', command: { type: 'setProperty', target: { kind: 'manifest' }, pointer: '/name', value: 'Renamed' } })
    store.dispatch({ type: 'projectCommand', command: { type: 'setProperty', target: { kind: 'entity', sceneId: 'main', entityId: 'box' }, pointer: '/name', value: 'Box 2' } })
    expect(store.getState().dirtyPaths.sort()).toEqual(['automata.project.json', 'scenes/main.scene.json'])
    store.dispatch({ type: 'markSaved', paths: ['automata.project.json', 'scenes/main.scene.json', 'missing.json'], snapshot: store.getState().snapshot })
    expect(store.getState().dirtyPaths).toEqual([])
  })

  it('updates save, snap, and viewport UI state', () => {
    const store = createProjectEditorStore(fakeEditorRegistration, fakeSnapshot())
    store.dispatch({ type: 'beginSave' })
    expect(store.getState().saveStatus).toEqual({ kind: 'saving' })
    store.dispatch({ type: 'setSnap', snap: 2 })
    store.dispatch({ type: 'setPrimaryView', view: '3d' })
    store.dispatch({ type: 'toggleInset' })
    expect(store.getState()).toMatchObject({ snap: 2, primaryView: '3d', insetVisible: false })
    expect(selectProjectSnapshot(store.getState())).toBe(store.getState().snapshot)
    expect(selectActiveScene(store.getState())).toBe(store.getState().snapshot.scenes.main)
  })
})
