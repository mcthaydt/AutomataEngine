import { describe, expect, it } from 'vitest'
import { defaultObject, validateProperty } from '../src'
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
  })

  it('validates references as non-empty strings without resolving them', () => {
    const ref = { kind: 'reference', key: 'r', label: 'R', required: true, target: 'entity' } as const satisfies import('../src').PropertySchema
    expect(validateProperty(ref, '')[0]).toMatchObject({ code: 'reference.empty' })
    expect(validateProperty(ref, 'some-id')).toEqual([])
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
})
