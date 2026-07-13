/** Deterministic RNG contract used by the seeded-generation/replay harness. */
export interface SeededRng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number
}

/** FNV-1a 32-bit — stable string→seed for labeled generation steps. */
export function hashStringToSeed(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32 — small, fast, deterministic across platforms. */
export function createSeededRng(seed: number): SeededRng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    nextInt(maxExclusive: number): number {
      return Math.floor(next() * maxExclusive)
    }
  }
}
