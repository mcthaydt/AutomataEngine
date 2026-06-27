/** Deterministic seeded PRNG (mulberry32). Same seed → same sequence. */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number
  /** Float in [min, max). */
  range(min: number, max: number): number
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number
  /** Deterministic permutation of `items`; never mutates the input. */
  shuffle<T>(items: readonly T[]): T[]
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    shuffle(items) {
      const out = [...items]
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j]!, out[i]!]
      }
      return out
    }
  }
  return rng
}
