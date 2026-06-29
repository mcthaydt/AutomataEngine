import { describe, expect, it } from 'vitest'
import { createProjectiles } from '../../src/systems/projectiles'
import { spawnProjectile as spawnConfiguredProjectile } from '../../src/sim/spawn'
import { defaultPulsebreakCompiledProject as config } from '../../src/project/template'
import { playingCtx } from '../helpers/ctx'

const ARENA = config.arena
const spawnProjectile = (world: Parameters<typeof spawnConfiguredProjectile>[0], options: Parameters<typeof spawnConfiguredProjectile>[1]) =>
  spawnConfiguredProjectile(world, options, config)

const opts = (over: Partial<Parameters<typeof spawnProjectile>[1]> = {}) => ({
  position: { x: 0, y: ARENA.y, z: 0 },
  velocity: { x: 10, y: 0, z: 0 },
  faction: 'player' as const, damage: 5, radius: 0.2, color: '#fff',
  ...over
})

describe('projectiles', () => {
  it('advances a projectile by its velocity and records prevPosition', () => {
    const ctx = playingCtx()
    const p = spawnProjectile(ctx.world, opts())
    createProjectiles().run(ctx)
    expect(p.transform!.position.x).toBeCloseTo(10 * ctx.dt)
    expect(p.transform!.prevPosition).toEqual({ x: 0, y: ARENA.y, z: 0 })
  })

  it('removes a projectile when its lifetime expires', () => {
    const ctx = playingCtx()
    const p = spawnProjectile(ctx.world, opts({ velocity: { x: 0, y: 0, z: 0 } }))
    p.lifetime!.remainingS = ctx.dt / 2
    createProjectiles().run(ctx)
    expect(ctx.world.has(p)).toBe(false)
  })

  it('removes a projectile that leaves the arena', () => {
    const ctx = playingCtx()
    const p = spawnProjectile(ctx.world, opts({ position: { x: ARENA.half + 5, y: ARENA.y, z: 0 } }))
    createProjectiles().run(ctx)
    expect(ctx.world.has(p)).toBe(false)
  })

  it('keeps an in-bounds, live projectile', () => {
    const ctx = playingCtx()
    const p = spawnProjectile(ctx.world, opts())
    createProjectiles().run(ctx)
    expect(ctx.world.has(p)).toBe(true)
  })

  it('is inert when not playing', () => {
    const ctx = playingCtx()
    const p = spawnProjectile(ctx.world, opts())
    ctx.store.dispatch({ type: 'paused' })
    createProjectiles().run(ctx)
    expect(p.transform!.position.x).toBe(0)
  })
})
