// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { levelKind } from '../../src/data/level'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { readDataFile } from '../helpers/data'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')

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
})
