import { describe, it, expect } from 'vitest'
import { toolDefs, parseToolArgs, RESOURCE_URIS, type ToolName } from '../src/tools'

interface JsonObjectSchema {
  type?: unknown
  properties?: Record<string, unknown>
  required?: unknown[]
}

const toolArgCases: Array<{ name: ToolName; args: Record<string, unknown> }> = [
  {
    name: 'addItem',
    args: {
      item: {
        id: 'box:0',
        kind: 'box',
        transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
        shape: { type: 'box', size: { x: 1, y: 1, z: 1 } },
        surface: { kind: 'color', value: '#7ec850' }
      }
    }
  },
  { name: 'moveSelected', args: { ids: ['a'], delta: { x: 1, y: 2, z: 3 } } },
  { name: 'setItemField', args: { id: 'box:0', path: 'transform.position.x', value: 2 } },
  { name: 'setSurface', args: { id: 'g:0', surface: { kind: 'texture', textureId: 't1' } } },
  { name: 'setMetadata', args: { path: 'title', value: 'Training Grounds' } },
  { name: 'deleteItems', args: { ids: ['a', 'b'] } },
  { name: 'getDoc', args: {} },
  { name: 'listItems', args: {} },
  { name: 'validate', args: {} },
  { name: 'testPlay', args: { maxSteps: 180 } }
]

function expectObjectSchemaCoversArgs(schema: unknown, args: Record<string, unknown>): void {
  expect(schema).toMatchObject({ type: 'object' })
  const objectSchema = schema as JsonObjectSchema
  const argKeys = Object.keys(args)
  expect(Object.keys(objectSchema.properties ?? {}).sort()).toEqual(argKeys.sort())
  expect((objectSchema.required ?? []).sort()).toEqual(argKeys.sort())
}

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

  it('validates args and exposes matching top-level JSON schema for every tool', () => {
    const defsByName = new Map(toolDefs().map((def) => [def.name, def]))
    for (const { name, args } of toolArgCases) {
      expect(parseToolArgs(name, args)).toEqual(args)
      expectObjectSchemaCoversArgs(defsByName.get(name)?.schema, args)
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
