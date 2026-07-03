import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { color, deriveObjectSchema, reference, tableOf, validateDataSchema, vec3 } from '../src'
import type { ProjectDataSchema } from '../src'

const stats = z.strictObject({
  speed: z.number().min(0).max(20).meta({ label: 'Speed', step: 0.5 }),
  mode: z.enum(['chase', 'kite']).meta({ label: 'Mode' }),
  tint: color({ label: 'Tint' }),
  target: reference({ target: 'resource', typeIds: ['fake.target'], label: 'Target' }).optional()
})

function validate(schema: ProjectDataSchema, value: unknown) {
  return validateDataSchema(schema, deriveObjectSchema(schema), value)
}

describe('validateDataSchema parity with the DSL validator', () => {
  it('validates nested values and reports JSON Pointer locations', () => {
    expect(validate(stats, { speed: -1, mode: 'other', tint: '#fff' })).toEqual([
      expect.objectContaining({ pointer: '/speed', code: 'number.min' }),
      expect.objectContaining({ pointer: '/mode', code: 'enum.value' })
    ])
  })

  it('accepts a fully valid object', () => {
    expect(validate(stats, { speed: 4, mode: 'chase', tint: '#0a0a0a', target: 'fake.a' })).toEqual([])
  })

  it('reports missing required fields and unknown keys', () => {
    expect(validate(stats, { tint: '#fff', extra: 1 })).toEqual([
      expect.objectContaining({ pointer: '/speed', code: 'required' }),
      expect.objectContaining({ pointer: '/mode', code: 'required' }),
      expect.objectContaining({ pointer: '/extra', code: 'object.unknownKey' })
    ])
  })

  it('escapes JSON Pointer tokens for awkward keys', () => {
    const schema = z.strictObject({ 'a/b~c': z.number().meta({ label: 'X' }) })
    expect(validate(schema, { 'a/b~c': 'no' })).toEqual([
      expect.objectContaining({ pointer: '/a~1b~0c', code: 'number.type' })
    ])
  })

  it('maps scalar type failures to the DSL codes', () => {
    const scalars = z.strictObject({
      flag: z.boolean(),
      name: z.string(),
      tint: color(),
      position: vec3(),
      capped: z.number().max(3)
    })
    expect(validate(scalars, { flag: 'yes', name: 5, tint: 'red', position: { x: 0, y: 0 }, capped: 9 })).toEqual([
      expect.objectContaining({ pointer: '/flag', code: 'boolean.type' }),
      expect.objectContaining({ pointer: '/name', code: 'string.type' }),
      expect.objectContaining({ pointer: '/tint', code: 'color.format' }),
      expect.objectContaining({ pointer: '/position', code: 'vec3.type' }),
      expect.objectContaining({ pointer: '/capped', code: 'number.max' })
    ])
    expect(validate(scalars, { flag: true, name: 'ok', tint: '#0a0a0a', position: { x: 0, y: 1, z: 2 }, capped: 2 })).toEqual([])
  })

  it('collapses issues inside a vec3 to one vec3.type at the vec3 pointer', () => {
    const schema = z.strictObject({ eye: vec3() })
    expect(validate(schema, { eye: { x: 0, y: Infinity, z: 2 } })).toEqual([
      expect.objectContaining({ pointer: '/eye', code: 'vec3.type' })
    ])
    expect(validate(schema, { eye: { x: 0, y: 0 } })).toEqual([
      expect.objectContaining({ pointer: '/eye', code: 'vec3.type' })
    ])
  })

  it('rejects NaN and non-finite numbers as number.type', () => {
    const schema = z.strictObject({ n: z.number() })
    expect(validate(schema, { n: Number.NaN })[0]).toMatchObject({ code: 'number.type', pointer: '/n' })
    expect(validate(schema, { n: Infinity })[0]).toMatchObject({ code: 'number.type', pointer: '/n' })
  })

  it('flags empty required references and allows empty optional ones', () => {
    const requiredRef = z.strictObject({ r: reference({ target: 'entity' }) })
    expect(validate(requiredRef, { r: '' })[0]).toMatchObject({ code: 'reference.empty', pointer: '/r' })
    expect(validate(requiredRef, { r: 'some-id' })).toEqual([])
    expect(validate(requiredRef, { r: 3 })[0]).toMatchObject({ code: 'reference.type', pointer: '/r' })
    const optionalRef = z.strictObject({ r: reference({ target: 'entity' }).optional() })
    expect(validate(optionalRef, { r: '' })).toEqual([])
  })

  it('rejects non-objects at the root', () => {
    expect(validate(stats, null)[0]).toMatchObject({ code: 'object.type', pointer: '' })
  })

  it('enforces array bounds and recurses element pointers', () => {
    const table = z.strictObject({
      rows: tableOf(stats, { minItems: 1, maxItems: 1 })
    })
    expect(validate(table, { rows: [] })[0]).toMatchObject({ code: 'array.minItems', pointer: '/rows' })
    expect(validate(table, {
      rows: [
        { speed: 4, mode: 'chase', tint: '#fff' },
        { speed: 1, mode: 'kite', tint: '#fff' }
      ]
    })[0]).toMatchObject({ code: 'array.maxItems', pointer: '/rows' })
    expect(validate(table, { rows: [{ speed: -1, mode: 'chase', tint: '#fff' }] })[0])
      .toMatchObject({ pointer: '/rows/0/speed', code: 'number.min' })
    expect(validate(table, { rows: 'not-array' })[0]).toMatchObject({ code: 'array.type', pointer: '/rows' })
  })
})
