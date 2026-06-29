import { CORE_TYPE_IDS, resolveWorldTransform, type ComponentInstance, type EntityDocument, type ProjectSnapshot, type SceneDocument } from '@automata/project'
import type { Level, WorldsManifest } from '../data/level'
import { MONKEY_BALL_TYPE_IDS, type CompiledMonkeyBallProject } from './types'

const RAD_TO_DEG = 180 / Math.PI

interface Vec3Data { x: number; y: number; z: number }
interface TransformData { position: Vec3Data; rotation: Vec3Data; scale: Vec3Data }
interface PrimitiveData { shape: 'box' | 'cylinder'; size: Vec3Data }
interface SpawnData { timeLimitS: number; fallY: number }
interface ArchetypeData { archetypeId: string; overrides: Record<string, unknown> }

/** Compile an authored snapshot back into the runtime's existing level types. */
export function compileMonkeyBallProject(snapshot: ProjectSnapshot): CompiledMonkeyBallProject {
  const tuning = singleton<CompiledMonkeyBallProject['tuning']>(snapshot, MONKEY_BALL_TYPE_IDS.physics)
  const manifest = singleton<WorldsManifest>(snapshot, MONKEY_BALL_TYPE_IDS.worlds)
  const orderedIds = manifest.worlds.flatMap((world) => world.levels)
  const levels: Record<string, Level> = {}
  for (const id of orderedIds) {
    const scene = snapshot.scenes[id]
    if (!scene) throw new Error(`Monkey Ball project: worlds resource references missing scene "${id}"`)
    levels[id] = compileScene(scene)
  }
  return {
    projectId: snapshot.manifest.id,
    tuning: structuredClone(tuning),
    manifest: structuredClone(manifest),
    levels,
    snapshot
  }
}

function compileScene(scene: SceneDocument): Level {
  const spawn = requireComponent<SpawnData>(scene, MONKEY_BALL_TYPE_IDS.spawn)
  const goal = requireComponent<Record<string, never>>(scene, MONKEY_BALL_TYPE_IDS.goal)
  const geometry = scene.entities.filter((entity) => hasComponent(entity, CORE_TYPE_IDS.primitive)).map((entity) => compileGeometry(scene, entity))
  if (geometry.length === 0) throw new Error(`Monkey Ball project: scene "${scene.id}" has no geometry`)

  return {
    id: scene.id,
    name: scene.name,
    timeLimitS: spawn.data.timeLimitS,
    fallY: spawn.data.fallY,
    spawn: toTuple(resolveWorldTransform(scene, spawn.entity.id).position),
    goal: { pos: toTuple(resolveWorldTransform(scene, goal.entity.id).position) },
    geometry,
    entities: scene.entities
      .filter((entity) => hasComponent(entity, MONKEY_BALL_TYPE_IDS.archetype))
      .map((entity) => compileArchetype(scene, entity))
  }
}

function compileGeometry(scene: SceneDocument, entity: EntityDocument): Level['geometry'][number] {
  const transform = component<TransformData>(entity, CORE_TYPE_IDS.transform)
  const primitive = component<PrimitiveData>(entity, CORE_TYPE_IDS.primitive)
  const surface = component<{ color: string }>(entity, CORE_TYPE_IDS.surface)
  const collider = component<{ friction?: number }>(entity, CORE_TYPE_IDS.collider)
  if (!transform || !primitive || !surface) throw new Error(`Monkey Ball project: geometry "${entity.id}" is missing transform/primitive/surface`)

  const world = resolveWorldTransform(scene, entity.id)
  const size = {
    x: primitive.data.size.x * world.scale.x,
    y: primitive.data.size.y * world.scale.y,
    z: primitive.data.size.z * world.scale.z
  }
  const rotation = transform.data.rotation
  const rot = [rotation.x * RAD_TO_DEG, rotation.y * RAD_TO_DEG, rotation.z * RAD_TO_DEG] as [number, number, number]
  const common = {
    uid: entity.id,
    pos: toTuple(world.position),
    ...(rot.some((value) => value !== 0) ? { rot } : {}),
    color: surface.data.color,
    friction: collider?.data.friction ?? 0.6
  }
  return primitive.data.shape === 'box'
    ? { shape: 'box', size: [size.x, size.y, size.z], ...common }
    : { shape: 'cylinder', radius: size.x / 2, height: size.y, ...common }
}

function compileArchetype(scene: SceneDocument, entity: EntityDocument): Level['entities'][number] {
  const archetype = component<ArchetypeData>(entity, MONKEY_BALL_TYPE_IDS.archetype)
  if (!archetype) throw new Error(`Monkey Ball project: entity "${entity.id}" is missing its archetype component`)
  const overrides = structuredClone(archetype.data.overrides)
  return {
    uid: entity.id,
    archetype: archetype.data.archetypeId,
    pos: toTuple(resolveWorldTransform(scene, entity.id).position),
    ...(Object.keys(overrides).length > 0 ? { overrides } : {})
  }
}

function singleton<T>(snapshot: ProjectSnapshot, typeId: string): T {
  const resource = Object.values(snapshot.resources).find((candidate) => candidate.typeId === typeId)
  if (!resource) throw new Error(`Monkey Ball project: missing resource "${typeId}"`)
  return resource.data as T
}

function requireComponent<T>(scene: SceneDocument, typeId: string): { entity: EntityDocument; data: T } {
  const matches = scene.entities.flatMap((entity) => {
    const found = component<T>(entity, typeId)
    return found ? [{ entity, data: found.data }] : []
  })
  if (matches.length !== 1) throw new Error(`Monkey Ball project: scene "${scene.id}" requires exactly one "${typeId}" component`)
  return matches[0]!
}

function component<T>(entity: EntityDocument, typeId: string): { instance: ComponentInstance; data: T } | undefined {
  const instance = entity.components.find((candidate) => candidate.typeId === typeId)
  return instance ? { instance, data: instance.data as T } : undefined
}

function hasComponent(entity: EntityDocument, typeId: string): boolean {
  return entity.components.some((candidate) => candidate.typeId === typeId)
}

function toTuple(value: Vec3Data): [number, number, number] {
  return [value.x, value.y, value.z]
}
