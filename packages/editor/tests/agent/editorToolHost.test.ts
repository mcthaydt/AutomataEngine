import { describe, expect, it } from 'vitest'
import { createEditorToolHost } from '../../src/agent/editorToolHost'
import { boxItem, playableDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

const seed = (): FakeDoc => ({ title: 'level', items: [boxItem('a')] })

describe('editorToolHost', () => {
  it('applies a write tool to the sandbox without touching the seed doc', async () => {
    const doc = seed()
    const host = createEditorToolHost({ definition: playableDefinition, initialDoc: doc })
    const res = await host.executeTool('addItem', { item: boxItem('b', 2, 2) })
    expect(res.ok).toBe(true)
    expect(doc.items).toHaveLength(1)
    expect(host.doc.items).toHaveLength(2)
    expect(host.commands).toEqual([{ type: 'addItem', item: boxItem('b', 2, 2) }])
  })

  it('returns an error result for invalid args rather than throwing', async () => {
    const host = createEditorToolHost({ definition: playableDefinition, initialDoc: seed() })
    const res = await host.executeTool('moveSelected', { ids: 'not-an-array' })
    expect(res.ok).toBe(false)
    expect(res.isError).toBe(true)
  })

  it('reports and omits a valid command that has no effect', async () => {
    const doc = seed()
    const definition = {
      ...playableDefinition,
      scene: { ...playableDefinition.scene, apply: (current: FakeDoc) => current }
    }
    const host = createEditorToolHost({ definition, initialDoc: doc })

    const result = await host.executeTool('setMetadata', { path: 'title', value: doc.title })

    expect(result).toMatchObject({
      ok: true,
      content: { applied: 'setMetadata', changed: false }
    })
    expect(host.commands).toEqual([])
    expect(host.doc).toBe(doc)
  })

  it('reads items, validation, doc, and runs testPlay', async () => {
    const host = createEditorToolHost({ definition: playableDefinition, initialDoc: seed() })
    expect((await host.executeTool('listItems', {})).content).toHaveLength(1)
    expect((await host.executeTool('getDoc', {})).content).toEqual(host.doc)
    expect((await host.executeTool('validate', {})).ok).toBe(true)
    const play = await host.executeTool('testPlay', { maxSteps: 30 })
    expect(play.ok).toBe(true)
    expect(play.content).toMatchObject({ outcome: 'incomplete' })
  })

  it('exposes resources by uri, with baseline defaulting to null', async () => {
    const host = createEditorToolHost({ definition: playableDefinition, initialDoc: seed() })
    expect(await host.readResource('editor://items')).toHaveLength(1)
    expect(await host.readResource('editor://baseline')).toBeNull()
    expect(host.listTools().map((d) => d.name)).toContain('addItem')
  })
})
