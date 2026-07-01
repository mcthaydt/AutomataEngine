import { describe, expect, it } from 'vitest'
import { createRng } from '../../src/sim/rng'

describe('seeded RNG', () => {
  it('repeats the same known sequence for the same seed', () => {
    const first = createRng(42)
    const second = createRng(42)
    const a = Array.from({ length: 5 }, () => first.next())
    const b = Array.from({ length: 5 }, () => second.next())
    expect(a).toEqual(b)
    expect(a).toEqual([
      0.002643892541527748,
      0.660311977379024,
      0.11095708678476512,
      0.8493769019842148,
      0.8754393914714456
    ])
  })

  it('normalizes zero and produces a distinct sequence for another seed', () => {
    expect(createRng(0).next()).toBe(createRng(0).next())
    expect(createRng(0).next()).not.toBe(createRng(42).next())
  })

  it('chooses bounded integers and deterministic array values', () => {
    const rng = createRng(7)
    for (let index = 0; index < 50; index++) {
      expect(rng.int(2, 5)).toBeGreaterThanOrEqual(2)
      expect(rng.int(2, 5)).toBeLessThanOrEqual(5)
    }
    expect(createRng(7).choose(['a', 'b', 'c'])).toBe('a')
  })

  it('shuffles deterministically without mutating the input', () => {
    const input = [1, 2, 3, 4, 5]
    expect(createRng(9).shuffle(input)).toEqual([3, 2, 4, 5, 1])
    expect(input).toEqual([1, 2, 3, 4, 5])
  })

  it('rejects invalid ranges and empty choices', () => {
    const rng = createRng(1)
    expect(() => rng.int(3, 2)).toThrow(/range/i)
    expect(() => rng.int(1.5, 2)).toThrow(/integer/i)
    expect(() => rng.choose([])).toThrow(/empty/i)
  })
})
