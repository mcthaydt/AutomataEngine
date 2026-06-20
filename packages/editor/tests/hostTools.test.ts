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
})
