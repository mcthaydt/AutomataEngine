import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { inventoryEditorContribution } from '../src/editorContribution'
import { fixtureConfig } from './fixtures'

describe('inventory editor contribution (thin preview)', () => {
  it('declares the pack id and (deliberately) no scene prefabs', () => {
    expect(inventoryEditorContribution.packId).toBe('interaction-inventory')
    expect(inventoryEditorContribution.prefabs).toEqual([])
  })

  it('preview adds one marker per composed item and removes them on dispose', () => {
    const render = createNullRenderer()
    const handle = inventoryEditorContribution.createPreview!(fixtureConfig(), render.port)
    expect(render.calls.filter((call) => call.op === 'add')).toHaveLength(2)
    handle.dispose()
    expect(render.port.objectCount).toBe(0)
  })

  it('preview validates its config through the pack schema', () => {
    const render = createNullRenderer()
    expect(() => inventoryEditorContribution.createPreview!({ bogus: true }, render.port)).toThrow()
  })
})
