// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { levelKind, worldsManifestKind } from '../../src/data/level'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { readDataFile } from '../helpers/data'
import baseline from '../fixtures/metric-baselines.json'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const manifest = parseData(worldsManifestKind, readDataFile('levels/worlds.json'), 'worlds.json')
const levelIds = manifest.worlds.flatMap((w) => w.levels)

describe('metric baseline (regression guard)', () => {
  it.each(levelIds)('%s matches the committed rest baseline', async (id) => {
    const level = parseData(levelKind, readDataFile(`levels/${id}.json`), `${id}.json`)
    const result = await runHeadlessPlay(level, lib, tuning, { maxSteps: baseline.restSteps })
    expect(result.outcome).toBe(baseline.restOutcome)
    expect(result.fallCount).toBe(baseline.restFallCount)
    expect(result.steps).toBe(baseline.restSteps)
  }, 20000)
})
