import { describe, expect, it } from 'vitest'
import { pathPosition } from '../../src/systems/path'

const line = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }]

describe('pathPosition', () => {
  it('returns the origin for an empty path', () => {
    expect(pathPosition([], 5, 'loop')).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('returns the single waypoint when there is only one', () => {
    expect(pathPosition([{ x: 1, y: 2, z: 3 }], 5, 'loop')).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('interpolates along a segment by arc length', () => {
    expect(pathPosition(line, 2.5, 'loop')).toEqual({ x: 2.5, y: 0, z: 0 })
  })

  it('loops back to the start past the total length', () => {
    expect(pathPosition(line, 12, 'loop')).toEqual({ x: 2, y: 0, z: 0 })
  })

  it('ping-pongs back toward the start in the second half of the period', () => {
    expect(pathPosition(line, 13, 'pingpong')).toEqual({ x: 7, y: 0, z: 0 })
  })

  it('treats degenerate (zero-length) paths as the first point', () => {
    const dot = [{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }]
    expect(pathPosition(dot, 9, 'pingpong')).toEqual({ x: 4, y: 0, z: 0 })
  })

  it('wraps negative distances in loop and ping-pong modes', () => {
    expect(pathPosition(line, -2, 'loop')).toEqual({ x: 8, y: 0, z: 0 })
    expect(pathPosition(line, -2, 'pingpong')).toEqual({ x: 2, y: 0, z: 0 })
  })

  it('skips a zero-length segment before a non-zero segment', () => {
    const withDuplicate = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }]
    expect(pathPosition(withDuplicate, 5, 'loop')).toEqual({ x: 5, y: 0, z: 0 })
  })
})
