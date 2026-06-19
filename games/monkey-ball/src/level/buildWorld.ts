import {
  createTransform, createWorld, quat, spawnFromArchetype,
  type ArchetypeLibrary, type RenderableDef, type RigidBodyDef, type World
} from '@automata/engine'
import type { Entity } from '../entity'
import type { Level } from '../data/level'

const DEG = Math.PI / 180
type Geometry = Level['geometry'][number]

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

/** Adds a level's geometry, ball, goal, and entities into an existing world. */
export function populateLevelWorld(
  world: World<Entity>, level: Level, lib: ArchetypeLibrary
): { ball: Entity } {
  for (const g of level.geometry) {
    world.add({
      transform: createTransform({ x: g.pos[0], y: g.pos[1], z: g.pos[2] }, rotationOf(g)),
      rigidBody: geometryRigidBody(g),
      renderable: geometryRenderable(g)
    })
  }
  const ball = spawnFromArchetype<Entity>(world, lib, 'ball', {
    transform: createTransform({ x: level.spawn[0], y: level.spawn[1], z: level.spawn[2] })
  })
  spawnFromArchetype<Entity>(world, lib, 'goal', {
    transform: createTransform({ x: level.goal.pos[0], y: level.goal.pos[1], z: level.goal.pos[2] })
  })
  for (const e of level.entities) {
    spawnFromArchetype<Entity>(world, lib, e.archetype, {
      transform: createTransform({ x: e.pos[0], y: e.pos[1], z: e.pos[2] }),
      ...(e.overrides ?? {})
    })
  }
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
