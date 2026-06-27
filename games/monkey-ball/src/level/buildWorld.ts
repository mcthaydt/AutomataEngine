import {
  createTransform, createWorld, quat, spawnFromArchetype,
  type ArchetypeLibrary, type RenderableDef, type RigidBodyDef, type World
} from '@automata/engine'
import type { Entity } from '../entity'
import { entityUid, geometryUid, type Level } from '../data/level'

const DEG = Math.PI / 180
type Geometry = Level['geometry'][number]

export interface PopulateLevelWorldOptions {
  /** When true, tag renderable entities with the SceneItem id used by the editor. */
  editorIds?: boolean
}

const editorId = (opts: PopulateLevelWorldOptions, id: string): string | undefined =>
  opts.editorIds ? id : undefined

const archetypeSeed = (
  lib: ArchetypeLibrary,
  name: string,
  overrides: Record<string, unknown>
): Entity => spawnFromArchetype<Entity>({ add: (entity) => entity }, lib, name, overrides)

function geometryRigidBody(g: Geometry): RigidBodyDef {
  if (g.shape === 'box') {
    return {
      kind: 'fixed',
      shape: { type: 'box', halfExtents: { x: g.size[0] / 2, y: g.size[1] / 2, z: g.size[2] / 2 } },
      friction: g.friction
    }
  }
  return {
    kind: 'fixed',
    shape: { type: 'cylinder', halfHeight: g.height / 2, radius: g.radius },
    friction: g.friction
  }
}

function geometryRenderable(g: Geometry): RenderableDef {
  return g.shape === 'box'
    ? { primitive: 'box', size: { x: g.size[0], y: g.size[1], z: g.size[2] }, color: g.color }
    : { primitive: 'cylinder', radius: g.radius, height: g.height, color: g.color }
}

function rotationOf(g: Geometry) {
  return g.rot ? quat.fromEuler(g.rot[0] * DEG, g.rot[1] * DEG, g.rot[2] * DEG) : quat.identity()
}

/** Build deterministic, world-independent entity data keyed by editor IDs when requested. */
export function levelEntitySeeds(
  level: Level,
  lib: ArchetypeLibrary,
  opts: PopulateLevelWorldOptions = {}
): Entity[] {
  const seeds: Entity[] = []
  for (const [index, g] of level.geometry.entries()) {
    seeds.push({
      editorId: editorId(opts, geometryUid(g, index)),
      transform: createTransform({ x: g.pos[0], y: g.pos[1], z: g.pos[2] }, rotationOf(g)),
      rigidBody: geometryRigidBody(g),
      renderable: geometryRenderable(g)
    })
  }
  seeds.push(archetypeSeed(lib, 'ball', {
    editorId: editorId(opts, 'marker:spawn'),
    transform: createTransform({ x: level.spawn[0], y: level.spawn[1], z: level.spawn[2] })
  }))
  seeds.push(archetypeSeed(lib, 'goal', {
    editorId: editorId(opts, 'marker:goal'),
    transform: createTransform({ x: level.goal.pos[0], y: level.goal.pos[1], z: level.goal.pos[2] })
  }))
  for (const [index, e] of level.entities.entries()) {
    seeds.push(archetypeSeed(lib, e.archetype, {
      editorId: editorId(opts, entityUid(e, index)),
      transform: createTransform({ x: e.pos[0], y: e.pos[1], z: e.pos[2] }),
      ...(e.overrides ?? {})
    }))
  }
  return seeds
}

/** Reconcile an editor-built world by stable document item identity. */
export function syncLevelWorld(
  world: World<Entity>,
  previous: Level,
  next: Level,
  lib: ArchetypeLibrary
): void {
  const seedMap = (level: Level): Map<string, Entity> => new Map(
    levelEntitySeeds(level, lib, { editorIds: true }).map((seed) => [seed.editorId!, seed])
  )
  const previousSeeds = seedMap(previous)
  const nextSeeds = seedMap(next)
  const liveById = new Map([...world.with('editorId')].map((entity) => [entity.editorId, entity]))
  const changed = new Set<string>()

  for (const [id, previousSeed] of previousSeeds) {
    const nextSeed = nextSeeds.get(id)
    if (!nextSeed || JSON.stringify(previousSeed) !== JSON.stringify(nextSeed)) changed.add(id)
  }
  for (const id of nextSeeds.keys()) {
    if (!previousSeeds.has(id)) changed.add(id)
  }

  for (const id of changed) {
    const live = liveById.get(id)
    if (live) world.remove(live)
  }
  for (const id of changed) {
    const seed = nextSeeds.get(id)
    if (seed) world.add(seed)
  }
}

/** Adds a level's deterministic seeds into an existing world. */
export function populateLevelWorld(
  world: World<Entity>,
  level: Level,
  lib: ArchetypeLibrary,
  opts: PopulateLevelWorldOptions = {}
): { ball: Entity } {
  let ball: Entity | undefined
  for (const seed of levelEntitySeeds(level, lib, opts)) {
    const entity = world.add(seed)
    if (entity.ball) ball = entity
  }
  if (!ball) throw new Error('ball archetype did not produce a ball entity')
  return { ball }
}

/** Builds a fresh world for a level (used on first load). */
export function buildLevelWorld(
  level: Level, lib: ArchetypeLibrary
): { world: World<Entity>; ball: Entity } {
  const world = createWorld<Entity>()
  const { ball } = populateLevelWorld(world, level, lib)
  return { world, ball }
}
