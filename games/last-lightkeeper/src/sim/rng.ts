export interface SeededRng {
  next(): number
  int(min: number, max: number): number
  choose<T>(values: readonly T[]): T
  shuffle<T>(values: readonly T[]): T[]
}

const ZERO_SEED = 0x6d2b_79f5

export function createRng(seed: number): SeededRng {
  let state = (seed >>> 0) || ZERO_SEED

  const next = (): number => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x1_0000_0000
  }

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error('RNG integer range requires integer bounds')
    }
    if (min > max) throw new Error('RNG range minimum must not exceed maximum')
    return min + Math.floor(next() * (max - min + 1))
  }

  const choose = <T>(values: readonly T[]): T => {
    if (values.length === 0) throw new Error('Cannot choose from an empty array')
    return values[int(0, values.length - 1)]!
  }

  const shuffle = <T>(values: readonly T[]): T[] => {
    const result = [...values]
    for (let index = result.length - 1; index > 0; index--) {
      const swapWith = int(0, index)
      ;[result[index], result[swapWith]] = [result[swapWith]!, result[index]!]
    }
    return result
  }

  return { next, int, choose, shuffle }
}
