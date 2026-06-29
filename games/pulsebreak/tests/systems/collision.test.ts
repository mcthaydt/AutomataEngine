import { describe, expect, it } from 'vitest'
import { createCollision } from '../../src/systems/collision'
import {
  buildEnemy as buildConfiguredEnemy,
  spawnPlayer as spawnConfiguredPlayer,
  spawnProjectile as spawnConfiguredProjectile
} from '../../src/sim/spawn'
import { defaultPulsebreakCompiledProject as config } from '../../src/project/template'
import type { FeedbackEvent } from '../../src/systems/feedback'
import { playingCtx } from '../helpers/ctx'

const ARENA = config.arena
const ENEMY = config.enemy
const PLAYER = config.player
const spawnPlayer = (world: Parameters<typeof spawnConfiguredPlayer>[0]) => spawnConfiguredPlayer(world, config)
const buildEnemy = (kind: Parameters<typeof buildConfiguredEnemy>[0], position: Parameters<typeof buildConfiguredEnemy>[1]) =>
  buildConfiguredEnemy(kind, position, config)
const spawnProjectile = (world: Parameters<typeof spawnConfiguredProjectile>[0], opts: Parameters<typeof spawnConfiguredProjectile>[1]) =>
  spawnConfiguredProjectile(world, opts, config)

const at = (x: number, z: number) => ({ x, y: ARENA.y, z })
const kinds = (ctx: ReturnType<typeof playingCtx>) =>
  ctx.feedback.read<FeedbackEvent>('feedback').map((e) => e.kind)

function playerShot(ctx: ReturnType<typeof playingCtx>, pos: { x: number; y: number; z: number }, damage: number) {
  return spawnProjectile(ctx.world, {
    position: pos, velocity: { x: 0, y: 0, z: 0 }, faction: 'player', damage, radius: 0.2, color: '#fff'
  })
}
function enemyShot(ctx: ReturnType<typeof playingCtx>, pos: { x: number; y: number; z: number }, damage: number) {
  return spawnProjectile(ctx.world, {
    position: pos, velocity: { x: 0, y: 0, z: 0 }, faction: 'enemy', damage, radius: 0.2, color: '#f00'
  })
}

describe('collision', () => {
  it('a player projectile damages an overlapping enemy and is consumed', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const enemy = ctx.world.add(buildEnemy('rammer', at(5, 0)))
    const proj = playerShot(ctx, at(5, 0), 5)
    createCollision().run(ctx)
    expect(enemy.health!.current).toBe(ENEMY.rammer.health - 5)
    expect(ctx.world.has(proj)).toBe(false)
    expect(kinds(ctx)).toContain('enemyHit')
  })

  it('a lethal player projectile kills the enemy and scores', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const enemy = ctx.world.add(buildEnemy('rammer', at(5, 0)))
    playerShot(ctx, at(5, 0), 999)
    createCollision().run(ctx)
    expect(ctx.world.has(enemy)).toBe(false)
    expect(ctx.store.getState().run.score).toBe(ENEMY.rammer.scoreValue)
    expect(kinds(ctx)).toContain('enemyKilled')
  })

  it('an enemy projectile damages the player, sets invulnerability, and is consumed', () => {
    const ctx = playingCtx()
    const player = spawnPlayer(ctx.world)
    const proj = enemyShot(ctx, at(0, 0), 8)
    createCollision().run(ctx)
    expect(ctx.store.getState().run.health).toBe(PLAYER.startHealth - 8)
    expect(player.invuln!.remainingS).toBeCloseTo(PLAYER.invulnS)
    expect(ctx.world.has(proj)).toBe(false)
    expect(kinds(ctx)).toContain('playerHit')
  })

  it('invulnerability blocks further damage in the same window', () => {
    const ctx = playingCtx()
    const player = spawnPlayer(ctx.world)
    player.invuln!.remainingS = 0.5
    enemyShot(ctx, at(0, 0), 8)
    createCollision().run(ctx)
    expect(ctx.store.getState().run.health).toBe(PLAYER.startHealth)
  })

  it('a touching rammer deals contact damage', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    ctx.world.add(buildEnemy('rammer', at(0, 0)))
    createCollision().run(ctx)
    expect(ctx.store.getState().run.health).toBe(PLAYER.startHealth - ENEMY.rammer.contactDamage)
  })

  it('only takes one hit per step thanks to invulnerability', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    ctx.world.add(buildEnemy('rammer', at(0, 0)))
    enemyShot(ctx, at(0, 0), 8)
    createCollision().run(ctx)
    const lost = PLAYER.startHealth - ctx.store.getState().run.health
    expect(lost).toBeLessThanOrEqual(Math.max(ENEMY.rammer.contactDamage, 8))
  })

  it('leaves a non-overlapping enemy unharmed', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const enemy = ctx.world.add(buildEnemy('rammer', at(10, 0)))
    const proj = playerShot(ctx, at(0, 0), 5)
    createCollision().run(ctx)
    expect(enemy.health!.current).toBe(ENEMY.rammer.health)
    expect(ctx.world.has(proj)).toBe(true)
  })

  it('one projectile kills at most one enemy', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    ctx.world.add(buildEnemy('rammer', at(5, 0)))
    ctx.world.add(buildEnemy('rammer', at(5, 0)))
    playerShot(ctx, at(5, 0), 999)
    createCollision().run(ctx)
    expect([...ctx.world.with('enemy')]).toHaveLength(1)
  })

  it('still resolves player projectiles when no player exists', () => {
    const ctx = playingCtx()
    const enemy = ctx.world.add(buildEnemy('rammer', at(5, 0)))
    playerShot(ctx, at(5, 0), 5)
    expect(() => createCollision().run(ctx)).not.toThrow()
    expect(enemy.health!.current).toBe(ENEMY.rammer.health - 5)
  })

  it('is inert when not playing', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const enemy = ctx.world.add(buildEnemy('rammer', at(0, 0)))
    ctx.store.dispatch({ type: 'paused' })
    createCollision().run(ctx)
    expect(enemy.health!.current).toBe(ENEMY.rammer.health)
    expect(ctx.store.getState().run.health).toBe(PLAYER.startHealth)
  })
})
