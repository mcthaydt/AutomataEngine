import { describe, expect, it } from 'vitest'
import { collectReferences, defaultObject, validateProperty } from '../src'
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

describe('property schemas', () => {
  it('validates nested values and reports JSON Pointer locations', () => {
    expect(validateProperty(stats, { speed: -1, mode: 'other', tint: '#fff' })).toEqual([
      expect.objectContaining({ pointer: '/speed', code: 'number.min' }),
      expect.objectContaining({ pointer: '/mode', code: 'enum.value' })
    ])
  })

  it('accepts a fully valid object', () => {
    expect(validateProperty(stats, { speed: 4, mode: 'chase', tint: '#0a0a0a', target: 'fake.a' })).toEqual([])
  })

  it('reports missing required fields and unknown keys', () => {
    expect(validateProperty(stats, { tint: '#fff', extra: 1 })).toEqual([
      expect.objectContaining({ pointer: '/speed', code: 'required' }),
      expect.objectContaining({ pointer: '/mode', code: 'required' }),
      expect.objectContaining({ pointer: '/extra', code: 'object.unknownKey' })
    ])
  })

  it('escapes JSON Pointer tokens for awkward keys', () => {
    const schema = { kind: 'object', fields: [{ key: 'a/b~c', label: 'X', kind: 'number', required: true }] } as const satisfies ObjectSchema
    expect(validateProperty(schema, { 'a/b~c': 'no' })).toEqual([
      expect.objectContaining({ pointer: '/a~1b~0c', code: 'number.type' })
    ])
  })

  it('validates scalar kinds', () => {
    expect(validateProperty({ kind: 'boolean', key: 'k', label: 'K', required: true }, 'yes')[0]).toMatchObject({ code: 'boolean.type' })
    expect(validateProperty({ kind: 'string', key: 'k', label: 'K', required: true }, 5)[0]).toMatchObject({ code: 'string.type' })
    expect(validateProperty({ kind: 'color', key: 'k', label: 'K', required: true }, 'red')[0]).toMatchObject({ code: 'color.format' })
    expect(validateProperty({ kind: 'vec3', key: 'k', label: 'K', required: true }, { x: 0, y: 0 })[0]).toMatchObject({ code: 'vec3.type' })
    expect(validateProperty({ kind: 'number', key: 'k', label: 'K', required: true, max: 3 }, 9)[0]).toMatchObject({ code: 'number.max' })
    expect(validateProperty({ kind: 'number', min: 0, max: 3 }, 2)).toEqual([])
    expect(validateProperty({ kind: 'number' }, Number.NaN)[0]).toMatchObject({ code: 'number.type' })
    expect(validateProperty({ kind: 'string' }, 'ok')).toEqual([])
    expect(validateProperty({ kind: 'boolean' }, true)).toEqual([])
    expect(validateProperty({ kind: 'enum', values: ['a'] }, 'a')).toEqual([])
    expect(validateProperty({ kind: 'color' }, 3)[0]).toMatchObject({ code: 'color.type' })
    expect(validateProperty({ kind: 'vec3' }, { x: 0, y: 1, z: 2 })).toEqual([])
    expect(validateProperty({ kind: 'vec3' }, { x: 0, y: Infinity, z: 2 })[0]).toMatchObject({ code: 'vec3.type' })
  })

  it('validates references as non-empty strings without resolving them', () => {
    const ref = { kind: 'reference', key: 'r', label: 'R', required: true, target: 'entity' } as const satisfies import('../src').PropertySchema
    expect(validateProperty(ref, '')[0]).toMatchObject({ code: 'reference.empty' })
    expect(validateProperty(ref, 'some-id')).toEqual([])
    expect(validateProperty({ ...ref, required: false }, '')).toEqual([])
    expect(validateProperty(ref, 3)[0]).toMatchObject({ code: 'reference.type' })
  })

  it('rejects non-objects and ignores metadata-only fields without keys', () => {
    expect(validateProperty(stats, null)[0]).toMatchObject({ code: 'object.type' })
    const schema = {
      kind: 'object',
      fields: [
        { kind: 'string', label: 'Decoration' },
        { kind: 'string', key: 'optional', required: false }
      ]
    } as const satisfies ObjectSchema
    expect(validateProperty(schema, { optional: undefined })).toEqual([])
  })

  it('validates object-array tables', () => {
    const table = { kind: 'array', item: stats, presentation: 'table' } as const satisfies import('../src').PropertySchema
    expect(validateProperty(table, [{ speed: 4, mode: 'chase', tint: '#fff' }])).toEqual([])
    expect(validateProperty(table, 'not-array')[0]).toMatchObject({ code: 'array.type' })
  })

  it('enforces array length bounds and recurses element pointers', () => {
    const table = { kind: 'array', item: stats, presentation: 'list', minItems: 1, maxItems: 1 } as const satisfies import('../src').PropertySchema
    expect(validateProperty(table, [])[0]).toMatchObject({ code: 'array.minItems' })
    expect(validateProperty(table, [{ speed: 4, mode: 'chase', tint: '#fff' }, { speed: 1, mode: 'kite', tint: '#fff' }])[0]).toMatchObject({ code: 'array.maxItems' })
    expect(validateProperty(table, [{ speed: -1, mode: 'chase', tint: '#fff' }])[0]).toMatchObject({ pointer: '/0/speed', code: 'number.min' })
  })
})

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
