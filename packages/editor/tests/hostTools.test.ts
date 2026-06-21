import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../src/host'
import { boxItem, renderDefinition, type FakeDoc } from './fixtures/fakeDefinition'

const nullPhysics = (): PhysicsPort => ({
  addBody() {},
  removeBody() {},
  setGravity() {},
  step: () => [],
  readPose: () => null,
  readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }),
  applyImpulse() {},
  setKinematicTarget() {},
  get bodyCount() { return 0 },
  dispose() {}
}) as PhysicsPort

function makeEditor() {
  return createEditor<FakeDoc>({
    definition: renderDefinition,
    render: createNullRenderer().port,
    physics: nullPhysics()
  })
}

describe('host tools', () => {
  it('places an item via the active place brush', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'setTool', tool: { brushId: 'box', mode: 'place' } })
    editor.placeAt({ x: 1, y: 0, z: 1 })
    expect(renderDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(1)
    editor.dispose()
  })

  it('places using the active snap increment', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'setSnap', snap: 1 })
    editor.store.dispatch({ type: 'setTool', tool: { brushId: 'box', mode: 'place' } })
    editor.placeAt({ x: 1.4, y: 0, z: 2.6 })
    const item = renderDefinition.scene.listItems(editor.store.getState().document.doc)[0]!
    expect(item.transform.position).toEqual({ x: 1, y: 0, z: 3 })
    editor.dispose()
  })

  it('selects the topmost item in the 2D map', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a', 0, 0) } })
    editor.pick2d({ x: 400, y: 300 }, { w: 800, h: 600 })
    expect(editor.store.getState().selection).toEqual(['a'])
    editor.dispose()
  })

  it('deletes the selection but guards required markers', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.store.dispatch({ type: 'select', ids: ['a'] })
    editor.deleteSelected()
    expect(renderDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(0)
    editor.dispose()
  })

  it('moves the selected item to a clicked world point', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.store.dispatch({ type: 'select', ids: ['a'] })
    editor.moveSelectionTo({ x: 4, y: 0, z: 5 })
    const item = renderDefinition.scene.listItems(editor.store.getState().document.doc)[0]!
    expect(item.transform.position).toEqual({ x: 4, y: 0, z: 5 })
    editor.dispose()
  })

  it('moves to the exact point when snap is off', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'setSnap', snap: 0 })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.store.dispatch({ type: 'select', ids: ['a'] })
    editor.moveSelectionTo({ x: 4.37, y: 0, z: 5.12 })
    const item = renderDefinition.scene.listItems(editor.store.getState().document.doc)[0]!
    expect(item.transform.position).toEqual({ x: 4.37, y: 0, z: 5.12 })
    editor.dispose()
  })

  it('cycles the surface of an item', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.cycleSurfaceOn('a')
    expect(renderDefinition.scene.getSurface(editor.store.getState().document.doc, 'a').kind).toBe('color')
    editor.dispose()
  })

  it('exposes a settable fly camera', () => {
    const editor = makeEditor()
    editor.camera = { position: { x: 1, y: 2, z: 3 }, yaw: 1, pitch: 0.2 }
    expect(editor.camera).toMatchObject({ position: { x: 1, y: 2, z: 3 }, yaw: 1, pitch: 0.2 })
    editor.dispose()
  })

  it('clears the selection when a 2D pick misses', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a', 0, 0) } })
    editor.store.dispatch({ type: 'select', ids: ['a'] })
    editor.pick2d({ x: 5, y: 5 }, { w: 800, h: 600 })
    expect(editor.store.getState().selection).toEqual([])
    editor.dispose()
  })

  it('clears the selection when a 3D pick misses', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'select', ids: ['a'] })
    editor.pick3d({ x: 0, y: 0 }, { w: 800, h: 600 })
    expect(editor.store.getState().selection).toEqual([])
    editor.dispose()
  })

  it('resolves a ground point under a screen pixel', () => {
    const editor = makeEditor()
    expect(editor.groundPointAt({ x: 400, y: 300 }, { w: 800, h: 600 })).not.toBeNull()
    editor.dispose()
  })

  it('placeAt does nothing without an active brush', () => {
    const editor = makeEditor()
    editor.placeAt({ x: 0, y: 0, z: 0 })
    expect(renderDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(0)
    editor.dispose()
  })

  it('placeAt does nothing for an unknown brush id', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'setTool', tool: { brushId: 'nope', mode: 'place' } })
    editor.placeAt({ x: 0, y: 0, z: 0 })
    expect(renderDefinition.scene.listItems(editor.store.getState().document.doc)).toHaveLength(0)
    editor.dispose()
  })

  it('moveSelectionTo does nothing without a selection', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.moveSelectionTo({ x: 9, y: 0, z: 9 })
    const item = renderDefinition.scene.listItems(editor.store.getState().document.doc)[0]!
    expect(item.transform.position).toEqual({ x: 0, y: 0, z: 0 })
    editor.dispose()
  })

  it('moveSelectionTo does nothing when the anchor is gone', () => {
    const editor = makeEditor()
    editor.store.dispatch({ type: 'select', ids: ['ghost'] })
    expect(() => editor.moveSelectionTo({ x: 1, y: 0, z: 1 })).not.toThrow()
    editor.dispose()
  })
})
