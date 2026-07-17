import { describe, expect, it } from 'vitest'
import { createSeededRng, hashStringToSeed } from '../../src/math/random'

describe('seeded rng', () => {
  it('is deterministic for equal seeds and diverges for different seeds', () => {
    const a = createSeededRng(42)
    const b = createSeededRng(42)
    const c = createSeededRng(43)
    const seqA = [a.next(), a.next(), a.next()]
    const seqB = [b.next(), b.next(), b.next()]
    const seqC = [c.next(), c.next(), c.next()]
    expect(seqA).toEqual(seqB)
    expect(seqA).not.toEqual(seqC)
  })

  it('produces values in [0,1) and bounded ints', () => {
    const rng = createSeededRng(7)
    for (let index = 0; index < 1000; index += 1) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      const int = rng.nextInt(10)
      expect(int).toBeGreaterThanOrEqual(0)
      expect(int).toBeLessThan(10)
      expect(Number.isInteger(int)).toBe(true)
    }
  })

  it('hashes strings to stable 32-bit seeds', () => {
    expect(hashStringToSeed('probe')).toBe(hashStringToSeed('probe'))
    expect(hashStringToSeed('probe')).not.toBe(hashStringToSeed('probe2'))
    expect(hashStringToSeed('probe')).toBeGreaterThanOrEqual(0)
  })
})
