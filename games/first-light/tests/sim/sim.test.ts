import { describe, expect, it } from 'vitest'
import { createInitialState, seekGoal, step, type SimTuning } from '../../src/sim/sim'

const tuning: SimTuning = { arenaHalf: 12, moveSpeed: 6, goal: { x: 8, z: 8 }, goalRadius: 1.5, timeLimitS: 30 }
const dt = 1 / 60

function run(t: SimTuning, maxSteps: number) {
  let state = createInitialState({ x: -8, z: -8 })
  let steps = 0
  while (steps < maxSteps && state.status === 'running') {
    state = step(state, seekGoal(state, t), dt, t)
    steps += 1
  }
  return { state, steps }
}

describe('sim', () => {
  it('is deterministic for identical inputs', () => {
    expect(run(tuning, 500)).toEqual(run(tuning, 500))
  })

  it('reaches the goal with the default tuning', () => {
    const { state, steps } = run(tuning, 500)
    expect(state.status).toBe('succeeded')
    expect(steps).toBeLessThan(500)
    expect(state.elapsedS).toBeCloseTo(steps * dt)
  })

  it('fails once the time limit passes', () => {
    const { state } = run({ ...tuning, timeLimitS: 0.05 }, 10)
    expect(state.status).toBe('failed')
  })

  it('is a no-op after a terminal state', () => {
    const { state } = run(tuning, 500)
    expect(step(state, { x: 1, z: 0 }, dt, tuning)).toBe(state)
  })

  it('normalizes oversized control and clamps to the arena', () => {
    const start = createInitialState({ x: 12, z: 0 })
    const moved = step(start, { x: 3, z: 4 }, 1, { ...tuning, timeLimitS: 100 })
    expect(moved.position.x).toBe(12)
    expect(moved.position.z).toBeCloseTo(4.8)
    expect(moved.status).toBe('running')
  })

  it('stops seeking once at the goal', () => {
    expect(seekGoal(createInitialState({ x: 8, z: 8 }), tuning)).toEqual({ x: 0, z: 0 })
  })
})
