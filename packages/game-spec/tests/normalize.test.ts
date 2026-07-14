import { describe, expect, it } from 'vitest'
import { normalizeGameSpec } from '../src'

describe('normalizeGameSpec', () => {
  it('canonicalizes key order deeply and preserves array order', () => {
    const messy = { b: 1, a: { z: [{ y: 2, x: 1 }], w: 3 } }
    const normalized = normalizeGameSpec(messy)
    expect(JSON.stringify(normalized)).toBe('{"a":{"w":3,"z":[{"x":1,"y":2}]},"b":1}')
    expect(normalizeGameSpec([3, 1, 2])).toEqual([3, 1, 2])
  })

  it('is idempotent', () => {
    const value = { b: [1, { d: 4, c: 3 }], a: 2 }
    const once = normalizeGameSpec(value)
    expect(normalizeGameSpec(once)).toEqual(once)
    expect(JSON.stringify(normalizeGameSpec(once))).toBe(JSON.stringify(once))
  })
})
