import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditorStore } from '../../src/state/store'
import { createWorldSync } from '../../src/viewport3d/worldSync'
import { boxItem, renderDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

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

describe('worldSync', () => {
  it('adds a render object per item and highlights the selection', () => {
    const store = createEditorStore<FakeDoc>(renderDefinition)
    const render = createNullRenderer()
    const sync = createWorldSync(renderDefinition, store, render.port, nullPhysics())

    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    sync.syncNow()
    expect(render.calls.some((call) => call.op === 'add')).toBe(true)

    store.dispatch({ type: 'select', ids: ['a'] })
    sync.syncNow()
    const highlight = render.calls.filter((call) => call.op === 'setHighlight').at(-1)
    expect(highlight).toMatchObject({ op: 'setHighlight', on: true })

    sync.dispose()
    expect(render.port.objectCount).toBe(0)
    expect(render.calls.some((call) => call.op === 'remove')).toBe(true)
  })

  it('render and applyHighlight are no-ops before the first sync', () => {
    const store = createEditorStore<FakeDoc>(renderDefinition)
    const sync = createWorldSync(renderDefinition, store, createNullRenderer().port, nullPhysics())
    expect(() => sync.render(0)).not.toThrow()
    expect(() => sync.applyHighlight()).not.toThrow()
    sync.dispose()
  })

  it('renders the built world after a sync', () => {
    const store = createEditorStore<FakeDoc>(renderDefinition)
    const render = createNullRenderer()
    const sync = createWorldSync(renderDefinition, store, render.port, nullPhysics())
    store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    sync.syncNow()
    expect(() => sync.render(0.5)).not.toThrow()
    sync.dispose()
  })
})
