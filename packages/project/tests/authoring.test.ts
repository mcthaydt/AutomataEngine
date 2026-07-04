import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { color, listOf, reference, tableOf, vec3 } from '../src'

describe('authoring helpers', () => {
  it('vec3 is a strict {x,y,z} object carrying the automata marker', () => {
    const schema = vec3({ label: 'Eye' })
    expect(schema.safeParse({ x: 0, y: 1, z: 2 }).success).toBe(true)
    expect(schema.safeParse({ x: 0, y: 1 }).success).toBe(false)
    expect(schema.safeParse({ x: 0, y: 1, z: 2, w: 3 }).success).toBe(false)
    expect(schema.meta()).toEqual({ label: 'Eye', automata: { kind: 'vec3' } })
  })

  it('color accepts #hex forms and rejects names', () => {
    const schema = color()
    for (const ok of ['#fff', '#ffff', '#a1b2c3', '#a1b2c3d4']) {
      expect(schema.safeParse(ok).success).toBe(true)
    }
    expect(schema.safeParse('red').success).toBe(false)
    expect(schema.meta()).toEqual({ automata: { kind: 'color' } })
  })

  it('reference records target and typeIds in the marker', () => {
    const schema = reference({ target: 'resource', typeIds: ['fake.target'], label: 'Target' })
    expect(schema.safeParse('some-id').success).toBe(true)
    expect(schema.safeParse(3).success).toBe(false)
    expect(schema.meta()).toEqual({
      label: 'Target',
      description: 'Id of an existing resource of type fake.target; must be non-empty unless this field is optional',
      automata: { kind: 'reference', target: 'resource', typeIds: ['fake.target'] }
    })
  })

  it('reference keeps an author-supplied description', () => {
    const schema = reference({ target: 'entity', description: 'custom' })
    expect(schema.meta()).toEqual({
      description: 'custom',
      automata: { kind: 'reference', target: 'entity' }
    })
  })

  it('listOf/tableOf enforce bounds through zod and record presentation', () => {
    const list = listOf(z.string(), { minItems: 1, maxItems: 2, label: 'Items' })
    expect(list.safeParse([]).success).toBe(false)
    expect(list.safeParse(['a']).success).toBe(true)
    expect(list.safeParse(['a', 'b', 'c']).success).toBe(false)
    expect(list.meta()).toEqual({
      label: 'Items',
      automata: { kind: 'array', presentation: 'list', minItems: 1, maxItems: 2 }
    })
    expect(tableOf(z.strictObject({})).meta()).toEqual({
      automata: { kind: 'array', presentation: 'table', minItems: undefined, maxItems: undefined }
    })
  })

  it('applies one-sided array bounds independently', () => {
    const atLeast = listOf(z.string(), { minItems: 1 })
    expect(atLeast.safeParse([]).success).toBe(false)
    expect(atLeast.safeParse(['a', 'b', 'c']).success).toBe(true)
    const atMost = listOf(z.string(), { maxItems: 1 })
    expect(atMost.safeParse([]).success).toBe(true)
    expect(atMost.safeParse(['a', 'b']).success).toBe(false)
  })

  it('metadata survives .optional() on the inner schema', () => {
    const schema = vec3({ label: 'Eye' }).optional()
    expect(schema.unwrap().meta()).toEqual({ label: 'Eye', automata: { kind: 'vec3' } })
  })
})
