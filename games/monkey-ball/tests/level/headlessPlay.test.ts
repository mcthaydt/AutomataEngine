// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { readDataFile } from '../helpers/data'
import { loadCanonicalProject } from '../helpers/project'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const canonical = await loadCanonicalProject()
const tuning = canonical.tuning
const level = canonical.levels['w1-l1']!

describe('runHeadlessPlay', () => {
  it('with no input the ball rests and the run is incomplete', async () => {
    const result = await runHeadlessPlay(level, lib, tuning, { maxSteps: 120 })

    expect(result.outcome).toBe('incomplete')
    expect(result.fallCount).toBe(0)
    expect(result.steps).toBe(120)
    expect(result.timeMs).toBeGreaterThan(0)
    expect(result.bananas).toBe(0)
  })

  it('rolling forward reaches the goal', async () => {
    const result = await runHeadlessPlay(level, lib, tuning, { input: () => ({ x: 0, y: 1 }), maxSteps: 3000 })

    expect(result.outcome).toBe('completed')
    expect(result.steps).toBeLessThan(3000)
  }, 20000)

  it('exposes the ball position and goal to a closed-loop input policy', async () => {
    const seen: { ballZ: number; goalZ: number }[] = []
    await runHeadlessPlay(level, lib, tuning, {
      input: (_step, obs) => {
        seen.push({ ballZ: obs.ball.position.z, goalZ: obs.goal.z })
        return { x: 0, y: 1 }
      },
      maxSteps: 30
    })
    expect(seen.length).toBeGreaterThan(0)
    // w1-l1: ball spawns near z=6, goal sits at z=-6.
    expect(seen[0]!.goalZ).toBe(-6)
    expect(seen[0]!.ballZ).toBeGreaterThan(0)
  }, 20000)

  it('maps an exhausted-life run to gameOver', async () => {
    const result = await runHeadlessPlay(
      { ...level, timeLimitS: 0.001 },
      lib,
      tuning,
      { maxSteps: 10 }
    )

    expect(result.outcome).toBe('gameOver')
    expect(result.steps).toBe(3)
  })
})
