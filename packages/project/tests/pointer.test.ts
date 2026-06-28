import { describe, expect, it } from 'vitest'
import {
  escapePointerToken, parsePointer, getAtPointer, setAtPointer,
  insertAtPointer, removeAtPointer, moveAtPointer, PointerError
} from '../src'

describe('JSON Pointer helpers', () => {
  it('escapes and parses RFC 6901 tokens', () => {
    expect(escapePointerToken('a/b~c')).toBe('a~1b~0c')
    expect(parsePointer('/a~1b~0c')).toEqual(['a/b~c'])
    expect(parsePointer('')).toEqual([])
    expect(parsePointer('/a/b')).toEqual(['a', 'b'])
  })

  it('rejects non-root paths without a leading slash', () => {
    expect(() => parsePointer('a/b')).toThrow(PointerError)
  })

  it('reads nested values and rejects bad navigation', () => {
    const root = { a: { b: [10, 20] } }
    expect(getAtPointer(root, '/a/b/1')).toBe(20)
    expect(() => getAtPointer(root, '/a/missing')).toThrow(PointerError)
    expect(() => getAtPointer(root, '/a/b/5')).toThrow(PointerError)
    expect(() => getAtPointer(root, '/a/b/-')).toThrow(PointerError)
    expect(() => getAtPointer(root, '/a/b/0/x')).toThrow(PointerError)
  })

  it('replaces nested values immutably, cloning only the path', () => {
    const root = { a: { b: 5 }, c: { d: 9 } }
    const next = setAtPointer(root, '/a/b', 7)
    expect(next).toEqual({ a: { b: 7 }, c: { d: 9 } })
    expect(next).not.toBe(root)
    expect(next.a).not.toBe(root.a)
    expect(next.c).toBe(root.c)
    expect(root.a.b).toBe(5)
  })

  it('returns the original root for a deep-equal primitive no-op', () => {
    const root = { a: { b: { x: 1 } } }
    expect(setAtPointer(root, '/a/b', { x: 1 })).toBe(root)
  })

  it('inserts, removes, and moves array items immutably', () => {
    expect(insertAtPointer({ arr: [1, 2, 3] }, '/arr', 1, 9)).toEqual({ arr: [1, 9, 2, 3] })
    expect(insertAtPointer({ arr: [1, 2, 3] }, '/arr', 3, 9)).toEqual({ arr: [1, 2, 3, 9] })
    expect(removeAtPointer({ arr: [1, 2, 3] }, '/arr', 1)).toEqual({ arr: [1, 3] })
    expect(moveAtPointer({ arr: [1, 2, 3] }, '/arr', 0, 2)).toEqual({ arr: [2, 3, 1] })
  })

  it('rejects out-of-range array operations', () => {
    expect(() => insertAtPointer({ arr: [1] }, '/arr', 5, 9)).toThrow(PointerError)
    expect(() => removeAtPointer({ arr: [1] }, '/arr', 5)).toThrow(PointerError)
    expect(() => moveAtPointer({ arr: [1] }, '/arr', 0, 5)).toThrow(PointerError)
  })
})
