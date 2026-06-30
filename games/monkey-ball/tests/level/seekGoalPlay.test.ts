// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { createSeekGoalPlayer } from '../../src/project/evaluation'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { levelKind, type Level } from '../../src/project/legacyTypes'
import { physicsTuningKind, toPhysicsTuning } from '../../src/project/legacyTypes'
import { readDataFile } from '../helpers/data'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')

describe('seek-goal player drives headless play', () => {
  it('completes a solvable level', async () => {
    const result = await runHeadlessPlay(level, lib, tuning, { input: createSeekGoalPlayer(), maxSteps: 3000 })
    expect(result.outcome).toBe('completed')
  }, 20000)

  it('does not complete when the goal is unreachable', async () => {
    const unreachable: Level = { ...level, goal: { pos: [level.goal.pos[0], 100, level.goal.pos[2]] } }
    const result = await runHeadlessPlay(unreachable, lib, tuning, { input: createSeekGoalPlayer(), maxSteps: 600 })
    expect(result.outcome).not.toBe('completed')
  }, 20000)
})
