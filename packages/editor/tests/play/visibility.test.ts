import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../../src/host'
import { markerItem, playableDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const nullPhysics = () => ({
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
}) as unknown as PhysicsPort

describe('visibility pause', () => {
  it('exits play when hidden, no-ops in edit', () => {
    const editor = createEditor<FakeDoc>({
      definition: playableDefinition,
      render: createNullRenderer().port,
      physics: nullPhysics()
    })

    editor.handleHidden()
    expect(editor.store.getState().mode).toBe('edit')

    editor.store.dispatch({
      type: 'command',
      command: { type: 'addItem', item: markerItem('marker:start', 'start') }
    })
    editor.enterPlay()
    editor.handleHidden()

    expect(editor.store.getState().mode).toBe('edit')
    editor.dispose()
  })
})
