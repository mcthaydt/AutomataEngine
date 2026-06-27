import { describe, expect, it } from 'vitest'
import { createPlayerWeapon } from '../../src/systems/playerWeapon'
import { buildEnemy, spawnPlayer } from '../../src/sim/spawn'
import { ARENA, PLAYER } from '../../src/config'
import type { FeedbackEvent } from '../../src/systems/feedback'
import { playingCtx } from '../helpers/ctx'

const projectiles = (ctx: ReturnType<typeof playingCtx>) => [...ctx.world.with('projectile', 'velocity')]

describe('playerWeapon', () => {
  it('fires a projectile toward the nearest enemy when ready', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    ctx.world.add(buildEnemy('rammer', { x: 4, y: ARENA.y, z: 0 }))
    createPlayerWeapon().run(ctx)
    const shots = projectiles(ctx)
    expect(shots).toHaveLength(1)
    expect(shots[0]!.projectile).toEqual({ faction: 'player', damage: ctx.store.getState().run.damage })
    expect(shots[0]!.velocity!.x).toBeGreaterThan(0)
    expect(shots[0]!.velocity!.z).toBeCloseTo(0)
  })

  it('targets the nearest of several enemies', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    ctx.world.add(buildEnemy('rammer', { x: 0, y: ARENA.y, z: 9 }))
    ctx.world.add(buildEnemy('rammer', { x: 3, y: ARENA.y, z: 0 }))
    createPlayerWeapon().run(ctx)
    const shot = projectiles(ctx)[0]!
    expect(shot.velocity!.x).toBeGreaterThan(0)
    expect(Math.abs(shot.velocity!.z)).toBeLessThan(Math.abs(shot.velocity!.x))
  })

  it('does not fire when no enemy is in range', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    ctx.world.add(buildEnemy('rammer', { x: PLAYER.range + 10, y: ARENA.y, z: 0 }))
    createPlayerWeapon().run(ctx)
    expect(projectiles(ctx)).toHaveLength(0)
  })

  it('respects the fire-rate cooldown', () => {
    const ctx = playingCtx()
    const player = spawnPlayer(ctx.world)
    ctx.world.add(buildEnemy('rammer', { x: 4, y: ARENA.y, z: 0 }))
    const weapon = createPlayerWeapon()
    weapon.run(ctx)
    weapon.run(ctx)
    expect(projectiles(ctx)).toHaveLength(1)
    expect(player.firing!.remainingS).toBeGreaterThan(0)
  })

  it('fires again once the cooldown elapses', () => {
    const ctx = playingCtx()
    const player = spawnPlayer(ctx.world)
    ctx.world.add(buildEnemy('rammer', { x: 4, y: ARENA.y, z: 0 }))
    const weapon = createPlayerWeapon()
    weapon.run(ctx)
    player.firing!.remainingS = 0
    weapon.run(ctx)
    expect(projectiles(ctx)).toHaveLength(2)
  })

  it('emits a shoot feedback fact', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    ctx.world.add(buildEnemy('rammer', { x: 4, y: ARENA.y, z: 0 }))
    createPlayerWeapon().run(ctx)
    expect(ctx.feedback.read<FeedbackEvent>('feedback').map((e) => e.kind)).toContain('shoot')
  })

  it('is inert when not playing', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    ctx.world.add(buildEnemy('rammer', { x: 4, y: ARENA.y, z: 0 }))
    ctx.store.dispatch({ type: 'paused' })
    createPlayerWeapon().run(ctx)
    expect(projectiles(ctx)).toHaveLength(0)
  })

  it('ticks the cooldown down even with no target', () => {
    const ctx = playingCtx()
    const player = spawnPlayer(ctx.world)
    player.firing!.remainingS = 0.5
    createPlayerWeapon().run(ctx)
    expect(player.firing!.remainingS).toBeCloseTo(0.5 - ctx.dt)
  })
})
