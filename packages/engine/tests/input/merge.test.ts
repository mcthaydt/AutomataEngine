import { describe, expect, it } from 'vitest'
import { mergeInputs } from '../../src/input/merge'
import type { InputSource } from '../../src/input/types'

const source = (x: number, y: number): InputSource =>
  ({ read: () => ({ x, y }), dispose: () => {} })

describe('mergeInputs', () => {
  it('returns zero vector for no sources', () => {
    expect(mergeInputs([])).toEqual({ x: 0, y: 0 })
  })

  it('sums sources', () => {
    expect(mergeInputs([source(0.5, 0), source(0, -0.25)])).toEqual({ x: 0.5, y: -0.25 })
  })

  it('clamps the merged magnitude to 1', () => {
    const merged = mergeInputs([source(1, 0), source(1, 0)])
    expect(merged.x).toBeCloseTo(1)
    expect(merged.y).toBeCloseTo(0)
    const diagonal = mergeInputs([source(1, 1)])
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1)
  })
})
