import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor, type EditorCore } from '../../src/host'
import { renderDefinition, type FakeDoc } from './fakeDefinition'

export function nullPhysics(): PhysicsPort {
  return {
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
  } as PhysicsPort
}

export function makeTestEditor(): EditorCore<FakeDoc> {
  return createEditor<FakeDoc>({
    definition: renderDefinition,
    render: createNullRenderer().port,
    physics: nullPhysics()
  })
}
