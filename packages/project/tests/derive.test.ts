import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { color, deriveObjectSchema, reference, tableOf, vec3, SchemaDeriveError } from '../src'

describe('deriveObjectSchema', () => {
  it('derives every supported construct into the closed IR', () => {
    const schema = z.strictObject({
      speed: z.number().min(0).max(20).meta({ label: 'Speed', step: 0.5 }),
      mode: z.enum(['chase', 'kite']).meta({ label: 'Mode' }),
      note: z.string().meta({ label: 'Note', multiline: true }).optional(),
      alive: z.boolean(),
      tint: color({ label: 'Tint' }),
      position: vec3({ label: 'Position' }),
      target: reference({ target: 'resource', typeIds: ['fake.target'], label: 'Target' }).optional(),
      rows: tableOf(
        z.strictObject({ id: z.string().meta({ label: 'ID' }) }),
        { label: 'Rows', minItems: 1 }
      ).optional(),
      nested: z.strictObject({ half: z.number().min(1) }).meta({ label: 'Nested' })
    })

    expect(deriveObjectSchema(schema)).toEqual({
      kind: 'object',
      fields: [
        { kind: 'number', key: 'speed', label: 'Speed', required: true, min: 0, max: 20, step: 0.5 },
        { kind: 'enum', key: 'mode', label: 'Mode', required: true, values: ['chase', 'kite'] },
        { kind: 'string', key: 'note', label: 'Note', required: false, multiline: true },
        { kind: 'boolean', key: 'alive', required: true },
        { kind: 'color', key: 'tint', label: 'Tint', required: true },
        { kind: 'vec3', key: 'position', label: 'Position', required: true },
        {
          kind: 'reference', key: 'target', label: 'Target', required: false,
          description: 'Id of an existing resource of type fake.target; must be non-empty unless this field is optional',
          target: 'resource', typeIds: ['fake.target']
        },
        {
          kind: 'array', key: 'rows', label: 'Rows', required: false,
          presentation: 'table', minItems: 1,
          item: { kind: 'object', fields: [{ kind: 'string', key: 'id', label: 'ID', required: true }] }
        },
        {
          kind: 'object', key: 'nested', label: 'Nested', required: true,
          fields: [{ kind: 'number', key: 'half', required: true, min: 1 }]
        }
      ]
    })
  })

  it('rejects non-strict objects with the offending path', () => {
    const loose = z.strictObject({ inner: z.object({ a: z.string() }) })
    expect(() => deriveObjectSchema(loose)).toThrow(SchemaDeriveError)
    expect(() => deriveObjectSchema(loose)).toThrow(/strictObject/)
    expect(() => deriveObjectSchema(loose)).toThrow(/\/inner/)
  })

  it('rejects bare z.array (arrays must come from listOf/tableOf)', () => {
    expect(() => deriveObjectSchema(z.strictObject({ xs: z.array(z.string()) })))
      .toThrow(/listOf|tableOf/)
  })

  it('rejects a non-object root (e.g. a bare vec3 helper)', () => {
    expect(() => deriveObjectSchema(vec3())).toThrow(/must be zod objects/)
  })

  it('rejects .int() and .multipleOf() with the offending path', () => {
    expect(() => deriveObjectSchema(z.strictObject({ count: z.number().int() })))
      .toThrow(/beyond \.min\(\)\/\.max\(\)/)
    expect(() => deriveObjectSchema(z.strictObject({ count: z.number().int() })))
      .toThrow(/\/count/)
    expect(() => deriveObjectSchema(z.strictObject({ n: z.number().multipleOf(5) })))
      .toThrow(/beyond \.min\(\)\/\.max\(\)/)
  })

  it('rejects length/format constraints on plain strings', () => {
    expect(() => deriveObjectSchema(z.strictObject({ name: z.string().min(1) })))
      .toThrow(/string constraints/)
    expect(() => deriveObjectSchema(z.strictObject({ name: z.string().min(1) })))
      .toThrow(/\/name/)
    expect(() => deriveObjectSchema(z.strictObject({ name: z.string().max(9) })))
      .toThrow(/string constraints/)
    expect(() => deriveObjectSchema(z.strictObject({ slug: z.string().regex(/^a/) })))
      .toThrow(/string constraints/)
  })

  it('still accepts the constrained-string helpers (color, reference)', () => {
    const derived = deriveObjectSchema(z.strictObject({
      tint: color(),
      target: reference({ target: 'entity' })
    }))
    expect(derived.fields.map((field) => field.kind)).toEqual(['color', 'reference'])
  })

  it('rejects unsupported zod constructs with the offending path', () => {
    expect(() => deriveObjectSchema(z.strictObject({ u: z.union([z.string(), z.number()]) })))
      .toThrow(/unsupported zod construct/)
  })

  it('rejects exclusive number bounds with the offending path', () => {
    const schema = z.strictObject({ n: z.number().gt(0) })
    expect(() => deriveObjectSchema(schema)).toThrow(SchemaDeriveError)
    expect(() => deriveObjectSchema(schema)).toThrow(/exclusive/)
    expect(() => deriveObjectSchema(schema)).toThrow(/\/n/)
  })

  it('keeps metadata attached after .optional()', () => {
    const derived = deriveObjectSchema(
      z.strictObject({ s: z.string().optional().meta({ label: 'X' }) })
    )
    expect(derived.fields).toEqual([
      { kind: 'string', key: 's', label: 'X', required: false }
    ])
  })

  it('derives unconstrained numbers without min/max keys', () => {
    const derived = deriveObjectSchema(z.strictObject({ n: z.number() }))
    expect(derived.fields).toEqual([{ kind: 'number', key: 'n', required: true }])
    expect(derived.fields[0]).not.toHaveProperty('min')
    expect(derived.fields[0]).not.toHaveProperty('max')
  })
})
