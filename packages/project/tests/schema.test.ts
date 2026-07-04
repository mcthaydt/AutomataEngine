import { describe, expect, it } from 'vitest'
import { collectReferences, defaultObject } from '../src'
import type { ObjectSchema } from '../src'

const stats = {
  kind: 'object',
  fields: [
    { key: 'speed', label: 'Speed', kind: 'number', required: true, min: 0, max: 20, step: 0.5 },
    { key: 'mode', label: 'Mode', kind: 'enum', required: true, values: ['chase', 'kite'] },
    { key: 'tint', label: 'Tint', kind: 'color', required: true },
    { key: 'target', label: 'Target', kind: 'reference', required: false, target: 'resource', typeIds: ['fake.target'] }
  ]
} as const satisfies ObjectSchema

describe('defaultObject', () => {
  it('produces a complete default record for an object schema', () => {
    expect(defaultObject(stats)).toEqual({
      speed: 0,
      mode: 'chase',
      tint: '#ffffff',
      target: ''
    })
  })

  it('builds defaults for every nested property kind', () => {
    const schema = {
      kind: 'object',
      fields: [
        { key: 'count', kind: 'number', min: 2 },
        { key: 'name', kind: 'string' },
        { key: 'enabled', kind: 'boolean' },
        { key: 'emptyEnum', kind: 'enum', values: [] },
        { key: 'position', kind: 'vec3' },
        { key: 'nested', kind: 'object', fields: [{ key: 'color', kind: 'color' }] },
        { key: 'items', kind: 'array', presentation: 'list', item: { kind: 'string' } },
        { kind: 'string', label: 'Ignored' }
      ]
    } as const satisfies ObjectSchema
    expect(defaultObject(schema)).toEqual({
      count: 2,
      name: '',
      enabled: false,
      emptyEnum: '',
      position: { x: 0, y: 0, z: 0 },
      nested: { color: '#ffffff' },
      items: []
    })
  })
})

describe('collectReferences', () => {
  const schema = {
    kind: 'object',
    fields: [
      { key: 'resource', kind: 'reference', target: 'resource' },
      { key: 'entity', kind: 'reference', target: 'entity' },
      {
        key: 'rows', kind: 'array', presentation: 'list',
        item: { kind: 'object', fields: [{ key: 'resource', kind: 'reference', target: 'resource' }] }
      }
    ]
  } as const satisfies ObjectSchema

  it('walks nested arrays and filters empty or differently-targeted references', () => {
    expect(collectReferences(schema, {
      resource: 'tuning', entity: 'spawn', rows: [{ resource: 'texture' }, { resource: '' }]
    }, 'resource')).toEqual(['tuning', 'texture'])
    expect(collectReferences(schema, {
      resource: 'tuning', entity: 'spawn', rows: [{ resource: 'texture' }]
    }, 'entity')).toEqual(['spawn'])
  })

  it('stops safely at malformed objects and arrays', () => {
    expect(collectReferences(schema, null, 'resource')).toEqual([])
    expect(collectReferences(schema, { resource: 4, rows: 'bad' }, 'resource')).toEqual([])
  })
})
