import { describe, expect, it } from 'vitest'
import { clampToUnit } from '../../src/input/vector'

describe('clampToUnit', () => {
  it('leaves sub-unit vectors unchanged', () => {
    expect(clampToUnit(0.5, -0.25)).toEqual({ x: 0.5, y: -0.25 })
  })

  it('returns the zero vector unchanged', () => {
    expect(clampToUnit(0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('scales over-unit vectors to magnitude 1, preserving direction', () => {
    const v = clampToUnit(3, 4)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1)
    expect(v.x).toBeCloseTo(0.6)
    expect(v.y).toBeCloseTo(0.8)
  })
})
