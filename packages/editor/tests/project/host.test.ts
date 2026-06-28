import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createProjectEditor } from '../../src/project/host'
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
})
