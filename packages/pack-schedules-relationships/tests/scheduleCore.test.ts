import { describe, expect, it } from 'vitest'
import { initialWalkerPositions, stepWalker, walkerTarget } from '../src/scheduleCore'
import { validConfig } from './fixtures'

describe('scheduleCore', () => {
  const walker = validConfig().walkers[0]!

  it('targets the station for the given slot', () => {
    expect(walkerTarget(walker, 0)).toEqual({ x: 2, z: 2 })
    expect(walkerTarget(walker, 3)).toEqual({ x: 0, z: 6 })
  })

  it('moves straight toward the target at speed', () => {
    const next = stepWalker({ x: 0, z: 0 }, { x: 10, z: 0 }, 2, 0.5)
    expect(next).toEqual({ x: 1, z: 0 })
  })

  it('clamps to exact arrival with no overshoot, then stays put', () => {
    const arrived = stepWalker({ x: 9.9, z: 0 }, { x: 10, z: 0 }, 2, 1)
    expect(arrived).toEqual({ x: 10, z: 0 })
    expect(stepWalker(arrived, { x: 10, z: 0 }, 2, 1)).toEqual({ x: 10, z: 0 })
  })

  it('is deterministic across split ticks (arrival independent of tick size)', () => {
    let a = { x: 0, z: 0 }
    for (let i = 0; i < 100; i += 1) a = stepWalker(a, { x: 3, z: 4 }, 2, 0.05)
    const b = stepWalker({ x: 0, z: 0 }, { x: 3, z: 4 }, 2, 5)
    expect(a).toEqual(b)
  })

  it('snapshots initial positions at the given slot', () => {
    expect(initialWalkerPositions([walker], 2)).toEqual({ 'walker-1': { x: 5, z: -2 } })
  })
})
