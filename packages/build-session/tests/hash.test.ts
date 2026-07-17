import { describe, expect, it } from 'vitest'
import { hashJson, hashText, stableStringify } from '../src/hash'

describe('hashing', () => {
  it('stableStringify is key-order independent and drops undefined members', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
    expect(stableStringify({ a: 1, gone: undefined })).toBe(stableStringify({ a: 1 }))
    expect(stableStringify([1, 'x', null])).toBe('[1,"x",null]')
  })

  it('hashJson equal for equivalent values, different otherwise', () => {
    expect(hashJson({ a: 1, b: 2 })).toBe(hashJson({ b: 2, a: 1 }))
    expect(hashJson({ a: 1 })).not.toBe(hashJson({ a: 2 }))
    expect(hashText('x')).toMatch(/^[0-9a-f]{64}$/)
  })
})
