import { describe, expect, it } from 'vitest'
import { vec3 } from '@automata/engine'
import { createEnemyAI } from '../../src/systems/enemyAI'
import { buildEnemy as buildConfiguredEnemy, spawnPlayer as spawnConfiguredPlayer } from '../../src/sim/spawn'
import { defaultPulsebreakCompiledProject as config } from '../../src/project/template'
import { playingCtx } from '../helpers/ctx'

const ARENA = config.arena
const ENEMY = config.enemy
const spawnPlayer = (world: Parameters<typeof spawnConfiguredPlayer>[0]) => spawnConfiguredPlayer(world, config)
const buildEnemy = (kind: Parameters<typeof buildConfiguredEnemy>[0], position: Parameters<typeof buildConfiguredEnemy>[1]) =>
  buildConfiguredEnemy(kind, position, config)

const distToOrigin = (p: { x: number; z: number }) => Math.hypot(p.x, p.z)

describe('enemyAI movement', () => {
  it('drives a rammer toward the player', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const rammer = ctx.world.add(buildEnemy('rammer', { x: 5, y: ARENA.y, z: 0 }))
    createEnemyAI().run(ctx)
    expect(rammer.transform!.position.x).toBeLessThan(5)
    expect(rammer.transform!.prevPosition).toEqual({ x: 5, y: ARENA.y, z: 0 })
  })

  it('drives the boss toward the player', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const boss = ctx.world.add(buildEnemy('boss', { x: 0, y: ARENA.y, z: 6 }))
    createEnemyAI().run(ctx)
    expect(boss.transform!.position.z).toBeLessThan(6)
  })

  it('makes a shooter approach when beyond its preferred range', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const far = ENEMY.shooter.preferredRange! + 5
    const shooter = ctx.world.add(buildEnemy('shooter', { x: 0, y: ARENA.y, z: far }))
    createEnemyAI().run(ctx)
    expect(distToOrigin(shooter.transform!.position)).toBeLessThan(far)
  })

  it('makes a shooter retreat when too close', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const near = ENEMY.shooter.preferredRange! - 5
    const shooter = ctx.world.add(buildEnemy('shooter', { x: 0, y: ARENA.y, z: near }))
    createEnemyAI().run(ctx)
    expect(distToOrigin(shooter.transform!.position)).toBeGreaterThan(near)
  })

  it('makes a shooter strafe at its preferred range', () => {
    const ctx = playingCtx()
    const player = spawnPlayer(ctx.world)
    const pref = ENEMY.shooter.preferredRange!
    const shooter = ctx.world.add(buildEnemy('shooter', { x: 0, y: ARENA.y, z: pref }))
    createEnemyAI().run(ctx)
    const toPlayer = vec3.sub(player.transform!.position, { x: 0, y: ARENA.y, z: pref })
    const v = shooter.velocity!
    expect(Math.abs(v.x * toPlayer.x + v.z * toPlayer.z)).toBeCloseTo(0)
    expect(Math.hypot(v.x, v.z)).toBeGreaterThan(0)
  })

  it('is inert when not playing', () => {
    const ctx = playingCtx()
    spawnPlayer(ctx.world)
    const rammer = ctx.world.add(buildEnemy('rammer', { x: 5, y: ARENA.y, z: 0 }))
    ctx.store.dispatch({ type: 'paused' })
    createEnemyAI().run(ctx)
    expect(rammer.transform!.position.x).toBe(5)
  })

  it('does nothing when there is no player', () => {
    const ctx = playingCtx()
    ctx.world.add(buildEnemy('rammer', { x: 5, y: ARENA.y, z: 0 }))
    expect(() => createEnemyAI().run(ctx)).not.toThrow()
  })
})
