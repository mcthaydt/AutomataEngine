import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createProjectEditor } from '../../src/project/host'
import { registerEditorProject } from '../../src/project/registration'
import { fakeEditorRegistration, fakeSnapshot, previewCalls } from '../fixtures/fakeProject'

function nullPhysics(): PhysicsPort {
  return {
    addBody() {}, removeBody() {}, setGravity() {}, step() { return [] }, readPose() { return null },
    readLinearVelocity() { return { x: 0, y: 0, z: 0 } }, applyImpulse() {}, setKinematicTarget() {},
    get bodyCount() { return 0 }, dispose() {}
  }
}

function makeEditor() {
  const render = createNullRenderer()
  const editor = createProjectEditor({ registration: fakeEditorRegistration, snapshot: fakeSnapshot(), render: render.port, physics: nullPhysics() })
  return { render, editor }
}

describe('project editor host', () => {
  it('renders the edit world and highlights the selection', () => {
    const { render, editor } = makeEditor()
    editor.tick(1)
    expect(render.calls.some((call) => call.op === 'add')).toBe(true)
    expect(render.calls.some((call) => call.op === 'setCamera')).toBe(true)

    editor.store.dispatch({ type: 'select', selection: { kind: 'entity', sceneId: 'main', entityIds: ['box'] } })
    editor.tick(1)
    expect(render.calls.some((call) => call.op === 'setHighlight' && call.on === true)).toBe(true)
  })

  it('places a prefab as one new entity', () => {
    const { editor } = makeEditor()
    const before = editor.store.getState().snapshot.scenes.main!.entities.length
    editor.placePrefabAt('box', { x: 2.2, y: 0, z: -1.3 })
    expect(editor.store.getState().snapshot.scenes.main!.entities.length).toBe(before + 1)
  })

  it('accepts a type-erased catalog registration', () => {
    const render = createNullRenderer()
    const editor = createProjectEditor({
      registration: registerEditorProject(fakeEditorRegistration),
      snapshot: fakeSnapshot(),
      render: render.port,
      physics: nullPhysics()
    })

    expect(editor.registration.gameId).toBe('fake')
    editor.enterPlay()
    expect(editor.store.getState().mode).toBe('play')
    editor.dispose()
  })

  it('moves the selected entity to a snapped local position then deletes it', () => {
    const { editor } = makeEditor()
    editor.store.dispatch({ type: 'select', selection: { kind: 'entity', sceneId: 'main', entityIds: ['box'] } })
    editor.moveSelectionTo({ x: 4, y: 0, z: 4 })
    const box = editor.store.getState().snapshot.scenes.main!.entities.find((entity) => entity.id === 'box')!
    const transform = box.components.find((component) => component.typeId === 'core.transform')!.data as { position: { x: number; z: number } }
    expect(transform.position.x).toBe(4)

    editor.deleteSelected()
    expect(editor.store.getState().snapshot.scenes.main!.entities.find((entity) => entity.id === 'box')).toBeUndefined()
  })

  it('enters and exits play, forwarding fixed/render to the preview handle', () => {
    previewCalls.length = 0
    const { editor } = makeEditor()
    editor.enterPlay()
    expect(editor.store.getState().mode).toBe('play')
    editor.fixedUpdate(0.016)
    editor.tick(1)
    expect(previewCalls).toContain('fixedUpdate')
    expect(previewCalls).toContain('render')
    editor.exitPlay()
    expect(editor.store.getState().mode).toBe('edit')
    expect(previewCalls).toContain('dispose')
  })

  it('keeps edit mode and a live world when preview creation fails', () => {
    const render = createNullRenderer()
    const broken = { ...fakeEditorRegistration, preview: { create() { throw new Error('boom') } } }
    const editor = createProjectEditor({ registration: broken, snapshot: fakeSnapshot(), render: render.port, physics: nullPhysics() })
    expect(() => editor.enterPlay()).toThrow(/boom/)
    expect(editor.store.getState().mode).toBe('edit')

    render.calls.length = 0
    editor.tick(1)
    expect(render.calls.some((call) => call.op === 'add' || call.op === 'setPose')).toBe(true)
  })

  it('handles absent play support, invalid snapshots, and repeated play transitions', () => {
    const render = createNullRenderer()
    const withoutPreview = { ...fakeEditorRegistration, preview: undefined }
    const noPreview = createProjectEditor({ registration: withoutPreview, snapshot: fakeSnapshot(), render: render.port, physics: nullPhysics() })
    expect(() => noPreview.enterPlay()).toThrow(/no preview/i)
    noPreview.exitPlay()
    noPreview.fixedUpdate(1 / 60)
    noPreview.dispose()

    const invalid = fakeSnapshot()
    invalid.scenes.main!.entities[0]!.components.push({ id: 'bad', typeId: 'unknown', data: {} })
    const invalidEditor = createProjectEditor({ registration: fakeEditorRegistration, snapshot: invalid, render: createNullRenderer().port, physics: nullPhysics() })
    expect(() => invalidEditor.enterPlay()).toThrow(/invalid project/i)
    invalidEditor.dispose()

    const { editor } = makeEditor()
    editor.enterPlay()
    editor.enterPlay()
    editor.exitPlay()
    editor.exitPlay()
    editor.dispose()
  })

  it('ignores unknown prefabs or missing scenes and generates collision-free IDs', () => {
    const { editor } = makeEditor()
    const initial = editor.store.getState().snapshot.scenes.main!.entities.length
    editor.placePrefabAt('missing', { x: 0, y: 0, z: 0 })
    expect(editor.store.getState().snapshot.scenes.main!.entities).toHaveLength(initial)

    editor.store.dispatch({
      type: 'projectCommand',
      command: {
        type: 'addEntity', sceneId: 'main',
        entity: { id: 'box-1', name: 'Reserved', enabled: true, components: [] }
      }
    })
    editor.placePrefabAt('box', { x: 1.2, y: 3, z: 1.2 })
    expect(editor.store.getState().snapshot.scenes.main!.entities.some((entity) => entity.id === 'box-2')).toBe(true)

    editor.store.dispatch({ type: 'setActiveScene', sceneId: 'missing' })
    editor.placePrefabAt('box', { x: 0, y: 0, z: 0 })
    expect(editor.drawModel({ w: 100, h: 100 })).toEqual([])
    editor.tick(1)
    editor.dispose()
  })

  it('moves parented entities and ignores selections without editable transforms', () => {
    const { editor } = makeEditor()
    editor.moveSelectionTo({ x: 1, y: 0, z: 1 })
    editor.store.dispatch({
      type: 'projectCommandBatch',
      commands: [
        { type: 'addEntity', sceneId: 'main', entity: { id: 'parent', name: 'Parent', enabled: true, components: [{ id: 't', typeId: 'core.transform', data: { position: { x: 5, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }] } },
        { type: 'addEntity', sceneId: 'main', entity: { id: 'child', name: 'Child', parentId: 'parent', enabled: true, components: [{ id: 't', typeId: 'core.transform', data: { position: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }] } },
        { type: 'addEntity', sceneId: 'main', entity: { id: 'plain', name: 'Plain', enabled: true, components: [] } }
      ]
    })
    editor.store.dispatch({ type: 'select', selection: { kind: 'entity', sceneId: 'main', entityIds: ['child'] } })
    editor.moveSelectionTo({ x: 8, y: 0, z: 0 })
    const child = editor.store.getState().snapshot.scenes.main!.entities.find((entity) => entity.id === 'child')!
    expect((child.components[0]!.data as { position: { x: number } }).position.x).toBe(3)

    editor.store.dispatch({ type: 'select', selection: { kind: 'entity', sceneId: 'main', entityIds: ['plain'] } })
    editor.moveSelectionTo({ x: 2, y: 0, z: 2 })
    expect(editor.store.getState().snapshot.scenes.main!.entities.find((entity) => entity.id === 'plain')!.components).toEqual([])
    editor.dispose()
  })

  it('deletes focused components and exercises hit/miss picking', () => {
    const { editor } = makeEditor()
    editor.pick2d({ x: 50, y: 50 }, { w: 100, h: 100 })
    expect(editor.store.getState().selection.kind).toBe('entity')
    editor.pick2d({ x: 0, y: 0 }, { w: 100, h: 100 })
    expect(editor.store.getState().selection.kind).toBe('scene')

    editor.store.dispatch({ type: 'select', selection: { kind: 'component', sceneId: 'main', entityId: 'box', componentId: 's' } })
    editor.tick(1)
    editor.deleteSelected()
    expect(editor.store.getState().snapshot.scenes.main!.entities[0]!.components.some((component) => component.id === 's')).toBe(false)
    editor.deleteSelected()
    editor.pick3d({ x: 50, y: 50 }, { w: 100, h: 100 })
    editor.dispose()
  })
})
