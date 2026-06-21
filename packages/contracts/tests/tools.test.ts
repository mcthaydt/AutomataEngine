import { describe, it, expect } from 'vitest'
import { toolDefs, parseToolArgs, RESOURCE_URIS } from '../src/tools'

describe('tool contract', () => {
  it('exposes one def per tool, each with a JSON schema + description', () => {
    const defs = toolDefs()
    const names = defs.map((d) => d.name).sort()
    expect(names).toEqual([
      'addItem', 'deleteItems', 'getDoc', 'listItems', 'moveSelected',
      'setItemField', 'setMetadata', 'setSurface', 'testPlay', 'validate'
    ])
    for (const d of defs) {
      expect(typeof d.schema).toBe('object')
      expect(d.description.length).toBeGreaterThan(0)
    }
  })

  it('validates moveSelected args without the type discriminant', () => {
    const args = parseToolArgs('moveSelected', { ids: ['a'], delta: { x: 1, y: 2, z: 3 } })
    expect(args).toEqual({ ids: ['a'], delta: { x: 1, y: 2, z: 3 } })
  })

  it('rejects bad testPlay args', () => {
    expect(() => parseToolArgs('testPlay', { maxSteps: -1 })).toThrow()
  })

  it('exposes editor resource uris', () => {
    expect(RESOURCE_URIS.doc).toBe('editor://doc')
    expect(RESOURCE_URIS.baseline).toBe('editor://baseline')
  })
})
