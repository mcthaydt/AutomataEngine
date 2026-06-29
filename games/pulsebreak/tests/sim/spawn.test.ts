import { describe, expect, it } from 'vitest'
import { createWorld, type Vec3, type World } from '@automata/engine'
import {
  buildEnemy as buildConfiguredEnemy,
  spawnPlayer as spawnConfiguredPlayer,
  spawnPositions,
  spawnProjectile as spawnConfiguredProjectile,
  spawnWave as spawnConfiguredWave,
  type ProjectileOptions
} from '../../src/sim/spawn'
import { createRng } from '../../src/sim/rng'
import { defaultPulsebreakCompiledProject as config } from '../../src/project/template'
import type { Entity } from '../../src/entity'

const world = () => createWorld<Entity>()
const ARENA = config.arena
const ENEMY = config.enemy
const PLAYER = config.player
const WAVES = config.waves
const spawnPlayer = (target: World<Entity>) => spawnConfiguredPlayer(target, config)
const buildEnemy = (kind: Parameters<typeof buildConfiguredEnemy>[0], position: Vec3) =>
  buildConfiguredEnemy(kind, position, config)
const spawnProjectile = (target: World<Entity>, opts: ProjectileOptions) =>
  spawnConfiguredProjectile(target, opts, config)
const spawnWave = (target: World<Entity>, wave: number, rng: ReturnType<typeof createRng>) =>
  spawnConfiguredWave(target, wave, rng, config)

describe('spawnPlayer', () => {
  it('adds a player at the spawn point with the expected components', () => {
    const w = world()
    const player = spawnPlayer(w)
    expect(player.player).toBe(true)
    expect(player.transform!.position).toEqual(PLAYER.spawn)
    expect(player.collider).toEqual({ radius: PLAYER.radius })
    expect(player.firing).toEqual({ remainingS: 0 })
    expect(player.invuln).toEqual({ remainingS: 0 })
    expect([...w.with('player')]).toHaveLength(1)
  })
})

describe('buildEnemy', () => {
  it('builds a rammer with contact damage and no weapon', () => {
    const rammer = buildEnemy('rammer', { x: 1, y: ARENA.y, z: 2 })
    expect(rammer.enemy).toEqual({ kind: 'rammer' })
    expect(rammer.health).toEqual({ current: ENEMY.rammer.health, max: ENEMY.rammer.health })
    expect(rammer.contactDamage).toEqual({ amount: ENEMY.rammer.contactDamage })
    expect(rammer.weapon).toBeUndefined()
    expect(rammer.scoreValue).toBe(ENEMY.rammer.scoreValue)
  })

  it('builds a shooter with a ranged weapon and kite distance', () => {
    const shooter = buildEnemy('shooter', { x: 0, y: ARENA.y, z: 0 })
    expect(shooter.weapon?.projectileDamage).toBe(ENEMY.shooter.projectileDamage)
    expect(shooter.weapon?.preferredRange).toBe(ENEMY.shooter.preferredRange)
    expect(shooter.weapon?.burst).toBeUndefined()
  })

  it('builds a boss with high health and a radial burst weapon', () => {
    const boss = buildEnemy('boss', { x: 0, y: ARENA.y, z: 0 })
    expect(boss.health!.max).toBe(ENEMY.boss.health)
    expect(boss.collider!.radius).toBe(ENEMY.boss.radius)
    expect(boss.weapon?.burst).toBe(ENEMY.boss.burst)
  })
})

describe('spawnProjectile', () => {
  it('adds a projectile carrying faction, damage, and a lifetime', () => {
    const w = world()
    const p = spawnProjectile(w, {
      position: { x: 0, y: ARENA.y, z: 0 },
      velocity: { x: 5, y: 0, z: 0 },
      faction: 'player', damage: 12, radius: 0.2, color: '#fff'
    })
    expect(p.projectile).toEqual({ faction: 'player', damage: 12 })
    expect(p.velocity).toEqual({ x: 5, y: 0, z: 0 })
    expect(p.lifetime!.remainingS).toBeGreaterThan(0)
    expect([...w.with('projectile')]).toHaveLength(1)
  })
})

describe('spawnWave', () => {
  it('spawns the wave-1 composition inside the arena', () => {
    const w = world()
    const spawned = spawnWave(w, 1, createRng(1))
    expect(spawned).toHaveLength(WAVES[0]!.rammer + WAVES[0]!.shooter)
    for (const e of spawned) {
      expect(e.transform!.position.y).toBe(ARENA.y)
      expect(Math.abs(e.transform!.position.x)).toBeLessThanOrEqual(ARENA.half)
      expect(Math.abs(e.transform!.position.z)).toBeLessThanOrEqual(ARENA.half)
    }
  })

  it('spawns a single boss on the final wave', () => {
    const w = world()
    const spawned = spawnWave(w, 5, createRng(1))
    expect(spawned).toHaveLength(1)
    expect(spawned[0]!.enemy).toEqual({ kind: 'boss' })
  })

  it('preserves one angular sequence across mixed enemy kinds', () => {
    const authored = structuredClone(config)
    authored.waves[0] = { rammer: 1, shooter: 1, boss: 0 }
    authored.spawnZones = authored.spawnZones.map((zone) => zone.id === 'enemy-ring'
      ? { ...zone, angleJitterRad: 0, edgePaddingMin: 1, edgePaddingMax: 1 }
      : zone)

    const spawned = spawnConfiguredWave(world(), 1, createRng(5), authored)

    expect(spawned.map((enemy) => enemy.transform!.position.x)).toEqual([12, -12])
  })

  it('is deterministic for a given seed and varies across seeds', () => {
    const a = spawnWave(world(), 3, createRng(9)).map((e) => e.transform!.position)
    const b = spawnWave(world(), 3, createRng(9)).map((e) => e.transform!.position)
    const c = spawnWave(world(), 3, createRng(10)).map((e) => e.transform!.position)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('spawns nothing for an out-of-range wave', () => {
    expect(spawnWave(world(), 99, createRng(1))).toEqual([])
  })
})

describe('spawnPositions', () => {
  it('keeps the fixed-seed authored-zone placement sequence stable', () => {
    expect(spawnPositions(
      config.spawnZones,
      'rammer',
      3,
      createRng(7)
    )).toEqual([
      { x: 11.189059480101047, y: 0.5, z: -3.980742002429619 },
      { x: -8.016828443211224, y: 0.5, z: 6.93769762699152 },
      { x: -5.4483913613429396, y: 0.5, z: -9.772808291637118 }
    ])
  })

  it('uses the authored boss point exactly', () => {
    expect(spawnPositions(
      config.spawnZones,
      'boss',
      1,
      createRng(7)
    )).toEqual([{ x: 0, y: 0.5, z: -11 }])
  })
})
