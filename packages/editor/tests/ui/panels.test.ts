import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../../src/host'
import { renderPanels } from '../../src/ui/panels'
import { renderDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

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

describe('panels', () => {
  it('renders palette brushes and a validation issue for the empty doc', () => {
    const host = document.createElement('div')
    const editor = createEditor<FakeDoc>({
      definition: renderDefinition,
      render: createNullRenderer().port,
      physics: nullPhysics()
    })
    const dispose = renderPanels(editor, host)
    expect(host.querySelectorAll('[data-brush]').length).toBeGreaterThan(0)
    expect(host.querySelector('[data-validation]')!.textContent).toContain('Start')
    dispose()
    editor.dispose()
  })
})
