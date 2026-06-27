import { createTransform, type RenderableDef, type Vec3, type World } from '@automata/engine'
import { ARENA, ENEMY, PLAYER, PROJECTILE_LIFETIME_S, WAVES, type EnemySpec } from '../config'
import type { Entity, EnemyKind, Faction } from '../entity'
import type { Rng } from './rng'

function renderableFor(kind: EnemyKind, spec: EnemySpec): RenderableDef {
  if (kind === 'shooter') {
    const s = spec.radius * 1.5
    return { primitive: 'box', size: { x: s, y: s, z: s }, color: spec.color }
  }
  return { primitive: 'sphere', radius: spec.radius, color: spec.color }
}

/** Adds the player hover-drone at the arena centre. */
export function spawnPlayer(world: World<Entity>): Entity {
  return world.add({
    player: true,
    transform: createTransform({ ...PLAYER.spawn }),
    velocity: { x: 0, y: 0, z: 0 },
    collider: { radius: PLAYER.radius },
    firing: { remainingS: 0 },
    invuln: { remainingS: 0 },
    renderable: { primitive: 'cylinder', radius: PLAYER.radius, height: 0.35, color: PLAYER.color }
  })
}

/** Builds (without adding) an enemy of `kind` at `position`. */
export function buildEnemy(kind: EnemyKind, position: Vec3): Entity {
  const spec = ENEMY[kind]
  const entity: Entity = {
    enemy: { kind },
    transform: createTransform({ ...position }),
    velocity: { x: 0, y: 0, z: 0 },
    collider: { radius: spec.radius },
    health: { current: spec.health, max: spec.health },
    contactDamage: { amount: spec.contactDamage },
    scoreValue: spec.scoreValue,
    renderable: renderableFor(kind, spec)
  }
  if (spec.cooldownS !== undefined) {
    entity.weapon = {
      cooldownS: spec.cooldownS,
      // Initial delay equal to the cooldown so a freshly spawned wave never
      // fires on the very first step.
      remainingS: spec.cooldownS,
      projectileSpeed: spec.projectileSpeed!,
      projectileDamage: spec.projectileDamage!,
      range: spec.range!,
      preferredRange: spec.preferredRange,
      burst: spec.burst
    }
  }
  return entity
}

export interface ProjectileOptions {
  position: Vec3
  velocity: Vec3
  faction: Faction
  damage: number
  radius: number
  color: string
}

/** Adds a projectile that travels with `velocity` until it hits or expires. */
export function spawnProjectile(world: World<Entity>, opts: ProjectileOptions): Entity {
  return world.add({
    projectile: { faction: opts.faction, damage: opts.damage },
    transform: createTransform({ ...opts.position }),
    velocity: { ...opts.velocity },
    collider: { radius: opts.radius },
    lifetime: { remainingS: PROJECTILE_LIFETIME_S },
    renderable: { primitive: 'sphere', radius: opts.radius, color: opts.color }
  })
}

function ringPosition(rng: Rng, index: number, total: number): Vec3 {
  const angle = (index / total) * Math.PI * 2 + rng.range(-0.35, 0.35)
  const radius = ARENA.half - rng.range(1, 3)
  return { x: Math.cos(angle) * radius, y: ARENA.y, z: Math.sin(angle) * radius }
}

/** Deterministically spawns every enemy for `wave` (1-based). */
export function spawnWave(world: World<Entity>, wave: number, rng: Rng): Entity[] {
  const spec = WAVES[wave - 1]
  if (!spec) return []
  const kinds: EnemyKind[] = [
    ...Array<EnemyKind>(spec.rammer).fill('rammer'),
    ...Array<EnemyKind>(spec.shooter).fill('shooter'),
    ...Array<EnemyKind>(spec.boss).fill('boss')
  ]
  return kinds.map((kind, index) => {
    const position = kind === 'boss'
      ? { x: 0, y: ARENA.y, z: -(ARENA.half - 2) }
      : ringPosition(rng, index, kinds.length)
    return world.add(buildEnemy(kind, position))
  })
}
