import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { stick } from '@automata/game-kit/testing'
import { createGameplay } from '../../src/game/gameplay'
import { defaultPulsebreakCompiledProject } from '../../src/project/template'
import type { PulsebreakCompiledProject } from '../../src/project/types'
import { createRng } from '../../src/sim/rng'
import { buildEnemy, spawnPlayer, spawnProjectile } from '../../src/sim/spawn'
import { createDirector } from '../../src/systems/director'
import { createEnemyAI } from '../../src/systems/enemyAI'
import { createPlayerControl } from '../../src/systems/playerControl'
import { createPlayerWeapon } from '../../src/systems/playerWeapon'
import { playingCtx } from '../helpers/ctx'

function config(mutator: (value: PulsebreakCompiledProject) => void): PulsebreakCompiledProject {
  const value = structuredClone(defaultPulsebreakCompiledProject)
  mutator(value)
  return value
}

describe('project runtime parity', () => {
  it('uses injected arena bounds and player movement stats', () => {
    const injected = config((value) => {
      value.arena.half = 5
      value.player.baseMoveSpeed = 20
    })
    const ctx = playingCtx({ config: injected, input: { x: 1, y: 0 }, dt: 1 })
    const player = spawnPlayer(ctx.world, injected)

    createPlayerControl().run(ctx)

    expect(player.transform!.position.x).toBe(5)
    expect(player.velocity!.x).toBe(20)
  })

  it('uses injected player damage and wave counts', () => {
    const injected = config((value) => {
      value.player.baseDamage = 77
      value.waves[0] = { rammer: 1, shooter: 0, boss: 0 }
    })
    const ctx = playingCtx({ config: injected })
    spawnPlayer(ctx.world, injected)
    ctx.world.add(buildEnemy('rammer', { x: 4, y: injected.arena.y, z: 0 }, injected))

    createPlayerWeapon().run(ctx)
    const shot = ctx.world.with('projectile').first
    expect(shot?.projectile?.damage).toBe(77)

    ctx.world.clear()
    spawnPlayer(ctx.world, injected)
    createDirector().run(ctx)
    expect([...ctx.world.with('enemy')]).toHaveLength(1)
  })

  it('uses injected projectile lifetime and enemy speed', () => {
    const injected = config((value) => {
      value.projectileLifetimeS = 9
      value.enemy.rammer.speed = 2
      value.arena.half = 100
    })
    const ctx = playingCtx({ config: injected, dt: 1 })
    spawnPlayer(ctx.world, injected)
    const enemy = ctx.world.add(buildEnemy('rammer', { x: 10, y: injected.arena.y, z: 0 }, injected))
    const projectile = spawnProjectile(ctx.world, {
      position: { x: 0, y: injected.arena.y, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      faction: 'player', damage: 1, radius: 0.1, color: '#fff'
    }, injected)

    createEnemyAI().run(ctx)

    expect(enemy.transform!.position.x).toBe(8)
    expect(projectile.lifetime!.remainingS).toBe(9)
  })

  it('builds floor, camera, and grid from compiled project data', () => {
    const injected = config((value) => {
      value.floor = {
        position: { x: 2, y: -1, z: 3 },
        size: { x: 12, y: 0.5, z: 14 },
        color: '#123456'
      }
      value.camera = { eye: { x: 1, y: 30, z: 2 }, look: { x: 3, y: 0, z: 4 } }
      value.arena.half = 6
    })
    const render = createNullRenderer()
    const game = createGameplay({
      config: injected,
      store: playingCtx({ config: injected }).store,
      render: render.port,
      rng: createRng(1),
      inputSources: [stick()]
    })

    expect(render.calls.find((call) => call.op === 'setCamera')).toMatchObject({
      position: injected.camera.eye,
      lookAt: injected.camera.look
    })
    expect(render.calls.find((call) => call.op === 'setGrid')?.opts).toEqual({
      size: 12,
      divisions: 12,
      color: '#1b2f63'
    })
    expect(render.calls.find((call) => call.op === 'add' && call.def?.primitive === 'box')?.def).toEqual({
      primitive: 'box',
      size: injected.floor.size,
      color: injected.floor.color
    })
    game.dispose()
  })
})
