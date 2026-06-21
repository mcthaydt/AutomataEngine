// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { levelKind, worldsManifestKind } from '../../src/data/level'
import { buildLevelWorld } from '../../src/level/buildWorld'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { readDataFile } from '../helpers/data'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const manifest = parseData(worldsManifestKind, readDataFile('levels/worlds.json'), 'worlds.json')
const levelIds = manifest.worlds.flatMap((w) => w.levels)

describe('shipped content', () => {
  it('has 2 worlds of 3 levels each', () => {
    expect(manifest.worlds).toHaveLength(2)
    for (const w of manifest.worlds) expect(w.levels).toHaveLength(3)
  })

  it.each(levelIds)('level %s parses and builds a world', (id) => {
    const level = parseData(levelKind, readDataFile(`levels/${id}.json`), `${id}.json`)
    expect(level.id).toBe(id)
    const { world } = buildLevelWorld(level, lib)
    expect([...world.with('ball')]).toHaveLength(1)
    expect([...world.with('goal')]).toHaveLength(1)
  })

  it.each(levelIds)('level %s rests on solid ground with no input (metric smoke)', async (id) => {
    const level = parseData(levelKind, readDataFile(`levels/${id}.json`), `${id}.json`)
    const result = await runHeadlessPlay(level, lib, tuning, { maxSteps: 180 })
    expect(result.outcome).toBe('incomplete')
    expect(result.fallCount).toBe(0)
    expect(result.steps).toBe(180)
  }, 20000)
})
