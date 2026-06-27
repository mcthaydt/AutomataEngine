import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createEditor } from '../src/host'
import type { GameDefinition } from '../src/model/gameDefinition'
import { boxItem, markerItem, renderDefinition, type FakeDoc } from './fixtures/fakeDefinition'

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

  it('re-highlights when the selection switches between two single items', () => {
    const render = createNullRenderer()
    const editor = createEditor<FakeDoc>({
      definition: renderDefinition,
      render: render.port,
      physics: nullPhysics()
    })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('a') } })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: boxItem('b') } })
    editor.store.dispatch({ type: 'select', ids: ['a'] })
    editor.tick(0)
    const mark = render.calls.length
    editor.store.dispatch({ type: 'select', ids: ['b'] })
    editor.tick(0)
    const highlightedB = render.calls.slice(mark).some(
      (call) =>
        call.op === 'setHighlight' &&
        (call.entity as { editorId?: string }).editorId === 'b' &&
        call.on === true
    )
    expect(highlightedB).toBe(true)
    editor.dispose()
  })

  it('rebuilds the 3D world when a doc is loaded after an initial tick', () => {
    const render = createNullRenderer()
    const editor = createEditor<FakeDoc>({
      definition: renderDefinition,
      render: render.port,
      physics: nullPhysics()
    })
    editor.tick(0)
    const addsBefore = render.calls.filter((call) => call.op === 'add').length
    editor.store.dispatch({ type: 'loadDoc', doc: { title: 'loaded', items: [boxItem('z')] } })
    editor.tick(0)
    const addsAfter = render.calls.filter((call) => call.op === 'add').length
    expect(addsAfter).toBeGreaterThan(addsBefore)
    editor.dispose()
  })

  it('rejects live play when a definition supports headless play only', () => {
    const definition = {
      ...renderDefinition,
      play: {
        runHeadlessPlay: async () => ({
          outcome: 'incomplete' as const,
          timeMs: 0,
          fallCount: 0,
          bananas: 0,
          steps: 0
        })
      }
    } as unknown as GameDefinition<FakeDoc>
    const editor = createEditor({
      definition,
      render: createNullRenderer().port,
      physics: nullPhysics()
    })
    editor.store.dispatch({ type: 'command', command: { type: 'addItem', item: markerItem('start') } })

    expect(() => editor.enterPlay()).toThrow('this definition has no play support')
    editor.dispose()
  })
})
