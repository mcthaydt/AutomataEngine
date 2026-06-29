// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { loadMonkeyBallProject } from '../../src/project/load'
import { readDataFile } from '../helpers/data'
import baseline from '../fixtures/metric-baselines.json'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const root = resolve(import.meta.dirname, '../../public/project')
const project = await loadMonkeyBallProject({ readText: (path) => readFile(resolve(root, path), 'utf8') })
const levelIds = project.manifest.worlds.flatMap((world) => world.levels)

describe('metric baseline (regression guard)', () => {
  it.each(levelIds)('%s matches the committed rest baseline', async (id) => {
    const result = await runHeadlessPlay(project.levels[id]!, lib, project.tuning, { maxSteps: baseline.restSteps })
    expect(result.outcome).toBe(baseline.restOutcome)
    expect(result.fallCount).toBe(baseline.restFallCount)
    expect(result.steps).toBe(baseline.restSteps)
  }, 20000)
})
