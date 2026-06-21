import { describe, expect, it } from 'vitest'
import { applyDeadzone } from '../../src/input/vector'

describe('applyDeadzone', () => {
  it('zeros input inside the dead-zone', () => {
    expect(applyDeadzone({ x: 0.05, y: 0 }, 0.1)).toEqual({ x: 0, y: 0 })
  })

  it('rescales so the dead-zone edge maps to 0 and full input stays ~1', () => {
    const edge = applyDeadzone({ x: 0.1, y: 0 }, 0.1)
    expect(Math.hypot(edge.x, edge.y)).toBeCloseTo(0)
    const full = applyDeadzone({ x: 1, y: 0 }, 0.1)
    expect(full.x).toBeCloseTo(1)
  })

  it('preserves direction', () => {
    const v = applyDeadzone({ x: 0.6, y: 0.8 }, 0.2)
    expect(v.y / v.x).toBeCloseTo(0.8 / 0.6)
  })
})
