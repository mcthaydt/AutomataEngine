// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import {
  entityUid,
  geometryUid,
  levelKind,
  worldsManifestKind,
  type Level
} from '../../src/data/level'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { compileMonkeyBallProject } from '../../src/project/compiler'
import { importLegacyMonkeyBallProject } from '../../src/project/legacyImporter'
import { readDataFile } from '../helpers/data'
import baseline from '../fixtures/metric-baselines.json'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
const manifest = parseData(worldsManifestKind, readDataFile('levels/worlds.json'), 'worlds.json')
const levelIds = manifest.worlds.flatMap((world) => world.levels)
const legacyLevels = Object.fromEntries(levelIds.map((id) => [
  id,
  parseData(levelKind, readDataFile(`levels/${id}.json`), `${id}.json`)
])) as Record<string, Level>
const compiled = compileMonkeyBallProject(importLegacyMonkeyBallProject({ tuning, manifest, levels: legacyLevels }))

function normalizeUids(level: Level): Level {
  return {
    ...level,
    geometry: level.geometry.map((geometry, index) => ({ ...geometry, uid: geometryUid(geometry, index) })),
    entities: level.entities.map((entity, index) => ({ ...entity, uid: entityUid(entity, index) }))
  }
}

describe('Monkey Ball project compiler', () => {
  it('compiles physics tuning and world ordering back to their runtime values', () => {
    expect(compiled.tuning).toEqual(tuning)
    expect(compiled.manifest).toEqual(manifest)
    expect(Object.keys(compiled.levels)).toEqual(levelIds)
  })

  it.each(levelIds)('compiles %s back to the normalized legacy level', (id) => {
    expect(compiled.levels[id]).toEqual(normalizeUids(legacyLevels[id]!))
  })

  it.each(levelIds)('%s retains its committed no-input headless baseline', async (id) => {
    const result = await runHeadlessPlay(compiled.levels[id]!, lib, compiled.tuning, { maxSteps: baseline.restSteps })
    expect(result.outcome).toBe(baseline.restOutcome)
    expect(result.fallCount).toBe(baseline.restFallCount)
    expect(result.steps).toBe(baseline.restSteps)
  }, 20000)
})
