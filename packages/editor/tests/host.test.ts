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

describe('createEditor core', () => {
  it('mounts, renders the doc, and exposes the store', () => {
    const render = createNullRenderer()
    const editor = createEditor<FakeDoc>({
      definition: renderDefinition,
      render: render.port,
      physics: nullPhysics()
    })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.tick(0)
    expect(render.calls.some((call) => call.op === 'add')).toBe(true)
    editor.dispose()
  })

  it('builds the 2D draw model from the store', () => {
    const render = createNullRenderer()
    const editor = createEditor<FakeDoc>({
      definition: renderDefinition,
      render: render.port,
      physics: nullPhysics()
    })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    expect(editor.drawModel({ w: 800, h: 600 })).toHaveLength(1)
    editor.dispose()
  })
})
