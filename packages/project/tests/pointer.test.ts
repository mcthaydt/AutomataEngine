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
    expect(() => insertAtPointer({ arr: [1] }, '/arr', -1, 9)).toThrow(PointerError)
    expect(() => removeAtPointer({ arr: [1] }, '/arr', 5)).toThrow(PointerError)
    expect(() => removeAtPointer({ arr: [1] }, '/arr', -1)).toThrow(PointerError)
    expect(() => moveAtPointer({ arr: [1] }, '/arr', 0, 5)).toThrow(PointerError)
    expect(() => moveAtPointer({ arr: [1] }, '/arr', -1, 0)).toThrow(PointerError)
    expect(() => moveAtPointer({ arr: [1] }, '/arr', 0, -1)).toThrow(PointerError)
  })

  it('covers root, object creation, and array replacement writes', () => {
    const root = { arr: [{ value: 1 }], keep: true }
    expect(getAtPointer(root, '')).toBe(root)
    expect(setAtPointer(root, '', { arr: [{ value: 1 }], keep: true })).toBe(root)
    expect(setAtPointer(root, '', { replaced: true })).toEqual({ replaced: true })
    expect(setAtPointer(root, '/created', 2)).toEqual({ ...root, created: 2 })
    expect(setAtPointer(root, '/arr/0/value', 2)).toEqual({ arr: [{ value: 2 }], keep: true })
    expect(setAtPointer(root, '/arr/-', { value: 3 })).toEqual({ arr: [{ value: 1 }, { value: 3 }], keep: true })
    expect(setAtPointer(root, '/arr/0', { value: 1 })).toBe(root)
  })

  it('rejects malformed set paths and non-array collection targets', () => {
    expect(() => getAtPointer({ arr: [1] }, '/arr/01')).toThrow(PointerError)
    expect(() => getAtPointer({ arr: [1] }, '/arr/nope')).toThrow(PointerError)
    expect(() => setAtPointer({ arr: [1] }, '/arr/2/x', 3)).toThrow(PointerError)
    expect(() => setAtPointer({ a: {} }, '/a/missing/x', 3)).toThrow(PointerError)
    expect(() => setAtPointer({ a: 1 }, '/a/x', 3)).toThrow(PointerError)
    expect(() => insertAtPointer({ value: 1 }, '/value', 0, 2)).toThrow(PointerError)
  })

  it('preserves identity when moving an item to the same index', () => {
    const root = { arr: ['a', 'b'] }
    expect(moveAtPointer(root, '/arr', 1, 1)).toBe(root)
  })
})
