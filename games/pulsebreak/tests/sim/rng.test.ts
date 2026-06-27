import { describe, expect, it } from 'vitest'
import { createRng } from '../../src/sim/rng'

describe('createRng', () => {
  it('produces a deterministic sequence for a given seed', () => {
    const a = createRng(1234)
    const b = createRng(1234)
    const seqA = [a.next(), a.next(), a.next(), a.next()]
    const seqB = [b.next(), b.next(), b.next(), b.next()]
    expect(seqA).toEqual(seqB)
  })

  it('yields different sequences for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toEqual(b.next())
  })

  it('returns floats in the half-open unit interval', () => {
    const rng = createRng(99)
    for (let i = 0; i < 500; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('range maps into [min, max)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 500; i++) {
      const v = rng.range(-3, 5)
      expect(v).toBeGreaterThanOrEqual(-3)
      expect(v).toBeLessThan(5)
    }
  })

  it('int returns an integer in [0, maxExclusive)', () => {
    const rng = createRng(42)
    const counts = new Map<number, number>()
    for (let i = 0; i < 600; i++) {
      const v = rng.int(4)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(4)
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    expect(counts.size).toBe(4)
  })

  it('shuffle returns a deterministic permutation without mutating the input', () => {
    const input = ['a', 'b', 'c', 'd']
    const shuffledA = createRng(5).shuffle(input)
    const shuffledB = createRng(5).shuffle(input)
    expect(shuffledA).toEqual(shuffledB)
    expect([...shuffledA].sort()).toEqual([...input].sort())
    expect(input).toEqual(['a', 'b', 'c', 'd'])
  })
})
