import { beforeEach, describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../../src/host'
import { playCalls, playableDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

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

const startMarker = {
  id: 'marker:start',
  kind: 'marker' as const,
  transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
  shape: { type: 'marker' as const, markerId: 'start' },
  surface: { kind: 'color' as const, value: '#0f0' }
}

describe('play controller', () => {
  beforeEach(() => { playCalls.length = 0 })

  it('enters play, drives the handle, and exits back to edit', () => {
    const editor = createEditor<FakeDoc>({
      definition: playableDefinition,
      render: createNullRenderer().port,
      physics: nullPhysics()
    })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: startMarker } })

    editor.enterPlay()
    expect(editor.store.getState().mode).toBe('play')
    editor.fixedUpdate(1 / 60)
    editor.tick(0)
    editor.exitPlay()

    expect(editor.store.getState().mode).toBe('edit')
    expect(playCalls).toEqual(['create', 'fixed', 'render', 'dispose'])
    editor.dispose()
  })

  it('refuses to enter play with an invalid document', () => {
    const editor = createEditor<FakeDoc>({
      definition: playableDefinition,
      render: createNullRenderer().port,
      physics: nullPhysics()
    })

    expect(() => editor.enterPlay()).toThrow(/invalid document/)
    expect(editor.store.getState().mode).toBe('edit')
    editor.dispose()
  })

  it('clears edit render objects when entering play and after dispose', () => {
    const render = createNullRenderer()
    const editor = createEditor<FakeDoc>({
      definition: playableDefinition,
      render: render.port,
      physics: nullPhysics()
    })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: startMarker } })
    editor.tick(0)
    expect(render.port.objectCount).toBeGreaterThan(0)

    editor.enterPlay()
    expect(render.port.objectCount).toBe(0)
    editor.exitPlay()
    editor.tick(0)
    expect(render.port.objectCount).toBeGreaterThan(0)
    editor.dispose()
    expect(render.port.objectCount).toBe(0)
  })

  it('throws if the definition has no play support', () => {
    const editor = createEditor<FakeDoc>({
      definition: { ...playableDefinition, play: undefined },
      render: createNullRenderer().port,
      physics: nullPhysics()
    })

    expect(() => editor.enterPlay()).toThrow(/play/)
    editor.dispose()
  })
})
