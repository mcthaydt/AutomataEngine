// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { createSeekGoalPlayer } from '../../src/project/evaluation'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import type { Level } from '../../src/project/types'
import { readDataFile } from '../helpers/data'
import { loadCanonicalProject } from '../helpers/project'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const canonical = await loadCanonicalProject()
const tuning = canonical.tuning
const level = canonical.levels['w1-l1']!

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
