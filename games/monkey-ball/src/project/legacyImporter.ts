import {
  CORE_TYPE_IDS,
  type ComponentInstance,
  type EntityDocument,
  type ProjectSnapshot,
  type SceneDocument
} from '@automata/project'
import { entityUid, geometryUid, type Level } from '../data/level'
import { MONKEY_BALL_TYPE_IDS, type LegacyMonkeyBallProjectInput } from './types'

const DEG_TO_RAD = Math.PI / 180
const ZERO = { x: 0, y: 0, z: 0 }
const ONE = { x: 1, y: 1, z: 1 }

type LegacyGeometry = Level['geometry'][number]
type LegacyEntity = Level['entities'][number]

/**
 * Convert the former TOML/world/level documents into the universal project
 * model. The mapping is pure and order-stable so repeated migration produces
 * byte-identical canonical bundles.
 */
export function importLegacyMonkeyBallProject(input: LegacyMonkeyBallProjectInput): ProjectSnapshot {
  const sceneIds = input.manifest.worlds.flatMap((world) => world.levels)
  const scenes: Record<string, SceneDocument> = {}
  for (const sceneId of sceneIds) {
    const level = input.levels[sceneId]
    if (!level) throw new Error(`Monkey Ball importer: worlds manifest references missing level "${sceneId}"`)
    if (level.id !== sceneId) throw new Error(`Monkey Ball importer: level id "${level.id}" does not match "${sceneId}"`)
    scenes[sceneId] = importScene(level)
  }

  const projectId = input.projectId ?? 'monkey-ball'
  return {
    manifest: {
      formatVersion: 1,
      id: projectId,
      name: input.projectName ?? 'Monkey Ball',
      gameId: 'monkey-ball',
      entrySceneId: sceneIds[0] ?? '',
      scenes: sceneIds.map((id) => ({ id, path: `scenes/${id}.scene.json` })),
      resources: [
        { id: 'physics', typeId: MONKEY_BALL_TYPE_IDS.physics, path: 'resources/physics.resource.json' },
        { id: 'worlds', typeId: MONKEY_BALL_TYPE_IDS.worlds, path: 'resources/worlds.resource.json' }
      ]
    },
    scenes,
    resources: {
      physics: {
        formatVersion: 1,
        id: 'physics',
        typeId: MONKEY_BALL_TYPE_IDS.physics,
        data: structuredClone(input.tuning)
      },
      worlds: {
        formatVersion: 1,
        id: 'worlds',
        typeId: MONKEY_BALL_TYPE_IDS.worlds,
        data: structuredClone(input.manifest)
      }
    }
  }
}

function importScene(level: Level): SceneDocument {
  const entities: EntityDocument[] = [
    markerEntity('marker:spawn', 'Spawn', level.spawn, {
      id: 'spawn', typeId: MONKEY_BALL_TYPE_IDS.spawn,
      data: { timeLimitS: level.timeLimitS, fallY: level.fallY }
    }),
    markerEntity('marker:goal', 'Goal', level.goal.pos, {
      id: 'goal', typeId: MONKEY_BALL_TYPE_IDS.goal, data: {}
    }),
    ...level.geometry.map(importGeometry),
    ...level.entities.map(importArchetype)
  ]
  assertUniqueEntityIds(level.id, entities)
  return { formatVersion: 1, id: level.id, name: level.name, entities }
}

function markerEntity(id: string, name: string, position: readonly number[], marker: ComponentInstance): EntityDocument {
  return { id, name, enabled: true, components: [transform(position), marker] }
}

function importGeometry(geometry: LegacyGeometry, index: number): EntityDocument {
  const id = geometryUid(geometry, index)
  const size = geometry.shape === 'box'
    ? fromTuple(geometry.size)
    : { x: geometry.radius * 2, y: geometry.height, z: geometry.radius * 2 }
  return {
    id,
    name: `${geometry.shape === 'box' ? 'Box' : 'Cylinder'} ${index + 1}`,
    enabled: true,
    components: [
      transform(geometry.pos, geometry.rot),
      { id: 'primitive', typeId: CORE_TYPE_IDS.primitive, data: { shape: geometry.shape, size } },
      { id: 'surface', typeId: CORE_TYPE_IDS.surface, data: { color: geometry.color } },
      { id: 'collider', typeId: CORE_TYPE_IDS.collider, data: { shape: geometry.shape, friction: geometry.friction } }
    ]
  }
}

function importArchetype(entity: LegacyEntity, index: number): EntityDocument {
  const id = entityUid(entity, index)
  return {
    id,
    name: `${entity.archetype} ${index + 1}`,
    enabled: true,
    components: [
      transform(entity.pos),
      {
        id: 'archetype',
        typeId: MONKEY_BALL_TYPE_IDS.archetype,
        data: { archetypeId: entity.archetype, overrides: structuredClone(entity.overrides ?? {}) }
      }
    ]
  }
}

function transform(position: readonly number[], rotation: readonly number[] = [0, 0, 0]): ComponentInstance {
  return {
    id: 'transform',
    typeId: CORE_TYPE_IDS.transform,
    data: {
      position: fromTuple(position),
      rotation: { x: rotation[0]! * DEG_TO_RAD, y: rotation[1]! * DEG_TO_RAD, z: rotation[2]! * DEG_TO_RAD },
      scale: { ...ONE }
    }
  }
}

function fromTuple(value: readonly number[]): { x: number; y: number; z: number } {
  return { x: value[0] ?? ZERO.x, y: value[1] ?? ZERO.y, z: value[2] ?? ZERO.z }
}

function assertUniqueEntityIds(sceneId: string, entities: readonly EntityDocument[]): void {
  const seen = new Set<string>()
  for (const entity of entities) {
    if (seen.has(entity.id)) throw new Error(`Monkey Ball importer: duplicate entity id "${entity.id}" in scene "${sceneId}"`)
    seen.add(entity.id)
  }
}
