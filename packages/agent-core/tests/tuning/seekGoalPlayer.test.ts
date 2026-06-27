import { describe, expect, it } from 'vitest'
import { createSeekGoalPlayer } from '../../src/tuning/seekGoalPlayer'
import type { PlayObservation } from '@automata/contracts'

const obs = (bx: number, bz: number, gx: number, gz: number): PlayObservation => ({
  step: 0,
  ball: { position: { x: bx, y: 0, z: bz }, velocity: { x: 0, y: 0, z: 0 } },
  goal: { x: gx, y: 0, z: gz }
})

describe('createSeekGoalPlayer', () => {
  it('steers toward a goal ahead in -z with positive input.y and ~zero input.x', () => {
    const seek = createSeekGoalPlayer()
    const input = seek(0, obs(0, 6, 0, -6))
    expect(input.y).toBeGreaterThan(0)
    expect(Math.abs(input.x)).toBeLessThan(1e-9)
  })

  it('returns zero input within the arrive radius', () => {
    const seek = createSeekGoalPlayer({ arriveRadius: 1 })
    expect(seek(0, obs(0, 0.2, 0, 0))).toEqual({ x: 0, y: 0 })
  })
})
