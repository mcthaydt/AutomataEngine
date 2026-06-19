import { describe, expect, it } from 'vitest'
import { snapToGrid, snapVec3XZ } from '../src/grid'

describe('grid snap', () => {
  it('rounds a scalar to the nearest cell', () => {
    expect(snapToGrid(1.2, 0.5)).toBe(1)
    expect(snapToGrid(1.3, 0.5)).toBe(1.5)
    expect(snapToGrid(-0.2, 1)).toBe(-0)
  })

  it('snaps x and z but leaves y untouched', () => {
    expect(snapVec3XZ({ x: 1.2, y: 3.7, z: -0.3 }, 0.5)).toEqual({ x: 1, y: 3.7, z: -0.5 })
  })
})
