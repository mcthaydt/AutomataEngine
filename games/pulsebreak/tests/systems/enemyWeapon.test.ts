import { describe, expect, it } from 'vitest'
import { createEnemyWeapon } from '../../src/systems/enemyWeapon'
import { buildEnemy, spawnPlayer } from '../../src/sim/spawn'
import { ARENA, ENEMY } from '../../src/config'
import type { FeedbackEvent } from '../../src/systems/feedback'
import { playingCtx } from '../helpers/ctx'

const enemyShots = (ctx: ReturnType<typeof playingCtx>) =>
  [...ctx.world.with('projectile', 'velocity')].filter((p) => p.projectile!.faction === 'enemy')

describe('enemyWeapon', () => {
  it('fires a single shot from a ready shooter in range, toward the player', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const shooter = ctx.world.add(buildEnemy('shooter', { x: 0, y: ARENA.y, z: 6 }))
    shooter.weapon!.remainingS = 0
    createEnemyWeapon().run(ctx)
    const shots = enemyShots(ctx)
    expect(shots).toHaveLength(1)
    expect(shots[0]!.projectile!.damage).toBe(ENEMY.shooter.projectileDamage)
    expect(shots[0]!.velocity!.z).toBeLessThan(0)
  })

  it('fires a radial burst from a ready boss', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const boss = ctx.world.add(buildEnemy('boss', { x: 0, y: ARENA.y, z: 6 }))
    boss.weapon!.remainingS = 0
    createEnemyWeapon().run(ctx)
    expect(enemyShots(ctx)).toHaveLength(ENEMY.boss.burst!)
  })

  it('does not fire when out of range', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const shooter = ctx.world.add(buildEnemy('shooter', { x: 0, y: ARENA.y, z: ENEMY.shooter.range! + 5 }))
    shooter.weapon!.remainingS = 0
    createEnemyWeapon().run(ctx)
    expect(enemyShots(ctx)).toHaveLength(0)
  })

  it('respects the cooldown', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    ctx.world.add(buildEnemy('shooter', { x: 0, y: ARENA.y, z: 6 })) // remainingS = cooldown
    createEnemyWeapon().run(ctx)
    expect(enemyShots(ctx)).toHaveLength(0)
  })

  it('emits an enemyShoot feedback fact', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const shooter = ctx.world.add(buildEnemy('shooter', { x: 0, y: ARENA.y, z: 6 }))
    shooter.weapon!.remainingS = 0
    createEnemyWeapon().run(ctx)
    expect(ctx.feedback.read<FeedbackEvent>('feedback').map((e) => e.kind)).toContain('enemyShoot')
  })

  it('ticks the cooldown down while out of range', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const shooter = ctx.world.add(buildEnemy('shooter', { x: 0, y: ARENA.y, z: ENEMY.shooter.range! + 5 }))
    shooter.weapon!.remainingS = 1
    createEnemyWeapon().run(ctx)
    expect(shooter.weapon!.remainingS).toBeCloseTo(1 - ctx.dt)
  })

  it('is inert when not playing', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const shooter = ctx.world.add(buildEnemy('shooter', { x: 0, y: ARENA.y, z: 6 }))
    shooter.weapon!.remainingS = 0
    ctx.store.dispatch({ type: 'paused' })
    createEnemyWeapon().run(ctx)
    expect(enemyShots(ctx)).toHaveLength(0)
  })

  it('does nothing when there is no player', () => {
    const ctx = playingCtx()
    const shooter = ctx.world.add(buildEnemy('shooter', { x: 0, y: ARENA.y, z: 6 }))
    shooter.weapon!.remainingS = 0
    expect(() => createEnemyWeapon().run(ctx)).not.toThrow()
    expect(enemyShots(ctx)).toHaveLength(0)
  })
})
