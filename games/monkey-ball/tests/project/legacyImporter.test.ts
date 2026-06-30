// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseData } from '@automata/engine'
import { CORE_TYPE_IDS, stringifyProjectBundle, toProjectBundle } from '@automata/project'
import { physicsTuningKind, toPhysicsTuning } from '../../src/project/legacyTypes'
import { levelKind, worldsManifestKind, type Level } from '../../src/project/legacyTypes'
import { importLegacyMonkeyBallProject } from '../../src/project/legacyImporter'
import { MONKEY_BALL_TYPE_IDS } from '../../src/project/types'
import { readDataFile } from '../helpers/data'

function legacyInputs(): {
  tuning: ReturnType<typeof toPhysicsTuning>
  manifest: ReturnType<(typeof worldsManifestKind)['schema']['parse']>
  levels: Record<string, Level>
} {
  const tuning = toPhysicsTuning(parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml'))
  const manifest = parseData(worldsManifestKind, readDataFile('levels/worlds.json'), 'worlds.json')
  const levels = Object.fromEntries(manifest.worlds.flatMap((world) => world.levels).map((id) => [
    id,
    parseData(levelKind, readDataFile(`levels/${id}.json`), `${id}.json`)
  ]))
  return { tuning, manifest, levels }
}

function componentData(snapshot: ReturnType<typeof importLegacyMonkeyBallProject>, sceneId: string, entityId: string, typeId: string): unknown {
  return snapshot.scenes[sceneId]!.entities
    .find((entity) => entity.id === entityId)!.components
    .find((component) => component.typeId === typeId)!.data
}

describe('legacy project importer', () => {
  it('produces byte-identical canonical bundles and preserves manifest scene order', () => {
    const input = legacyInputs()
    const first = importLegacyMonkeyBallProject(input)
    const second = importLegacyMonkeyBallProject(input)

    expect(stringifyProjectBundle(toProjectBundle(first))).toBe(stringifyProjectBundle(toProjectBundle(second)))
    expect(first.manifest.scenes.map((scene) => scene.id)).toEqual(input.manifest.worlds.flatMap((world) => world.levels))
  })

  it('maps stable geometry/entity ids and uses dedicated spawn and goal entities', () => {
    const snapshot = importLegacyMonkeyBallProject(legacyInputs())
    const scene = snapshot.scenes['w1-l1']!

    expect(scene.entities.map((entity) => entity.id)).toEqual([
      'marker:spawn', 'marker:goal', 'geometry:0', 'entity:0', 'entity:1', 'entity:2'
    ])
    expect(componentData(snapshot, 'w1-l1', 'marker:spawn', MONKEY_BALL_TYPE_IDS.spawn)).toEqual({
      timeLimitS: 60,
      fallY: -10
    })
    expect(componentData(snapshot, 'w1-l1', 'marker:goal', MONKEY_BALL_TYPE_IDS.goal)).toEqual({})
  })

  it('preserves box and cylinder geometry, rotation, color, and friction exactly', () => {
    const input = legacyInputs()
    input.levels['w1-l1']!.geometry.push({
      shape: 'cylinder', uid: 'cylinder-deck', radius: 2, height: 1.25,
      pos: [3, 4, 5], rot: [15, 45, 90], color: '#123abc', friction: 0.25
    })
    const snapshot = importLegacyMonkeyBallProject(input)

    expect(componentData(snapshot, 'w1-l1', 'geometry:0', CORE_TYPE_IDS.primitive)).toEqual({
      shape: 'box', size: { x: 8, y: 0.5, z: 16 }
    })
    expect(componentData(snapshot, 'w1-l1', 'geometry:0', CORE_TYPE_IDS.surface)).toEqual({ color: '#7ec850' })
    expect(componentData(snapshot, 'w1-l1', 'geometry:0', CORE_TYPE_IDS.collider)).toEqual({ shape: 'box', friction: 0.6 })

    expect(componentData(snapshot, 'w1-l1', 'cylinder-deck', CORE_TYPE_IDS.transform)).toEqual({
      position: { x: 3, y: 4, z: 5 },
      rotation: { x: Math.PI / 12, y: Math.PI / 4, z: Math.PI / 2 },
      scale: { x: 1, y: 1, z: 1 }
    })
    expect(componentData(snapshot, 'w1-l1', 'cylinder-deck', CORE_TYPE_IDS.primitive)).toEqual({
      shape: 'cylinder', size: { x: 4, y: 1.25, z: 4 }
    })
    expect(componentData(snapshot, 'w1-l1', 'cylinder-deck', CORE_TYPE_IDS.surface)).toEqual({ color: '#123abc' })
    expect(componentData(snapshot, 'w1-l1', 'cylinder-deck', CORE_TYPE_IDS.collider)).toEqual({ shape: 'cylinder', friction: 0.25 })
  })

  it('preserves archetype overrides and physics/world resources', () => {
    const input = legacyInputs()
    const snapshot = importLegacyMonkeyBallProject(input)
    const legacyPlatform = input.levels['w2-l1']!.entities[0]!

    expect(componentData(snapshot, 'w2-l1', 'entity:0', MONKEY_BALL_TYPE_IDS.archetype)).toEqual({
      archetypeId: 'moving-platform',
      overrides: legacyPlatform.overrides
    })
    expect(snapshot.resources.physics!.data).toEqual(input.tuning)
    expect(snapshot.resources.worlds!.data).toEqual(input.manifest)
  })
})
