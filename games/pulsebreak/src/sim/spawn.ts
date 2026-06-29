import { createTransform, type RenderableDef, type Vec3, type World } from '@automata/engine'
import type { EnemySpec, PulsebreakCompiledProject, SpawnZone } from '../project/types'
import type { Entity, EnemyKind, Faction } from '../entity'
import type { Rng } from './rng'

function renderableFor(kind: EnemyKind, spec: EnemySpec): RenderableDef {
  if (kind === 'shooter') {
    const s = spec.radius * 1.5
    return { primitive: 'box', size: { x: s, y: s, z: s }, color: spec.color }
  }
  return { primitive: 'sphere', radius: spec.radius, color: spec.color }
}

/** Adds the player hover-drone at the authored spawn point. */
export function spawnPlayer(world: World<Entity>, config: PulsebreakCompiledProject): Entity {
  const player = config.player
  return world.add({
    player: true,
    transform: createTransform({ ...player.spawn }),
    velocity: { x: 0, y: 0, z: 0 },
    collider: { radius: player.radius },
    firing: { remainingS: 0 },
    invuln: { remainingS: 0 },
    renderable: { primitive: 'cylinder', radius: player.radius, height: 0.35, color: player.color }
  })
}

/** Builds (without adding) an enemy of `kind` at `position`. */
export function buildEnemy(kind: EnemyKind, position: Vec3, config: PulsebreakCompiledProject): Entity {
  const spec = config.enemy[kind]
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
export function spawnProjectile(world: World<Entity>, opts: ProjectileOptions, config: PulsebreakCompiledProject): Entity {
  return world.add({
    projectile: { faction: opts.faction, damage: opts.damage },
    transform: createTransform({ ...opts.position }),
    velocity: { ...opts.velocity },
    collider: { radius: opts.radius },
    lifetime: { remainingS: config.projectileLifetimeS },
    renderable: { primitive: 'sphere', radius: opts.radius, color: opts.color }
  })
}

/**
 * Deterministically sample authored spawn zones for one enemy type.
 *
 * Eligible zones are sorted before weighted selection. A ring sample keeps the
 * old even angular distribution, then applies authored jitter/padding. Up to
 * eight retries enforce separation; exhaustion has the stable zone-center
 * fallback required by the project format.
 */
export function spawnPositions(
  zones: readonly SpawnZone[], enemyTypeId: EnemyKind, count: number, rng: Rng
): Vec3[] {
  return spawnPositionsInSequence(zones, enemyTypeId, count, rng, 0, count)
}

function spawnPositionsInSequence(
  zones: readonly SpawnZone[],
  enemyTypeId: EnemyKind,
  count: number,
  rng: Rng,
  indexOffset: number,
  sequenceCount: number
): Vec3[] {
  const eligible = zones
    .filter((zone) => zone.enemyTypeIds.includes(enemyTypeId) && zone.weight > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (count <= 0) return []
  if (eligible.length === 0) throw new Error(`No authored spawn zone for enemy "${enemyTypeId}"`)

  const totalWeight = eligible.reduce((sum, zone) => sum + zone.weight, 0)
  const positions: Vec3[] = []
  for (let index = 0; index < count; index++) {
    const zone = weightedZone(eligible, totalWeight, rng)
    let accepted: Vec3 | undefined
    for (let attempt = 0; attempt <= 8; attempt++) {
      const candidate = sampleZone(zone, indexOffset + index, sequenceCount, rng)
      if (positions.every((position) => distanceXZ(position, candidate) >= zone.minSeparation)) {
        accepted = candidate
        break
      }
    }
    positions.push(accepted ?? { ...zone.center })
  }
  return positions
}

/** Deterministically spawns every enemy for `wave` (1-based). */
export function spawnWave(world: World<Entity>, wave: number, rng: Rng, config: PulsebreakCompiledProject): Entity[] {
  const spec = config.waves[wave - 1]
  if (!spec) return []
  const spawned: Entity[] = []
  const total = spec.rammer + spec.shooter + spec.boss
  let indexOffset = 0
  for (const kind of ['rammer', 'shooter', 'boss'] as const) {
    for (const position of spawnPositionsInSequence(config.spawnZones, kind, spec[kind], rng, indexOffset, total)) {
      spawned.push(world.add(buildEnemy(kind, position, config)))
    }
    indexOffset += spec[kind]
  }
  return spawned
}

function weightedZone(zones: readonly SpawnZone[], totalWeight: number, rng: Rng): SpawnZone {
  // Preserve the legacy jitter/padding RNG sequence when no weighted choice is
  // actually required (the shipped project has one eligible zone per type).
  if (zones.length === 1) return zones[0]!
  let cursor = rng.range(0, totalWeight)
  for (const zone of zones) {
    cursor -= zone.weight
    if (cursor < 0) return zone
  }
  return zones[zones.length - 1]!
}

function sampleZone(zone: SpawnZone, index: number, count: number, rng: Rng): Vec3 {
  if (zone.mode === 'point') return { ...zone.center }
  const angle = (index / count) * Math.PI * 2 + rng.range(-zone.angleJitterRad, zone.angleJitterRad)
  const radius = zone.radius - rng.range(zone.edgePaddingMin, zone.edgePaddingMax)
  return {
    x: zone.center.x + Math.cos(angle) * radius,
    y: zone.center.y,
    z: zone.center.z + Math.sin(angle) * radius
  }
}

function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}
