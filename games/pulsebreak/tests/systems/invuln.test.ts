import { describe, expect, it } from 'vitest'
import { createInvuln } from '../../src/systems/invuln'
import { spawnPlayer as spawnConfiguredPlayer } from '../../src/sim/spawn'
import { defaultPulsebreakCompiledProject as config } from '../../src/project/template'
import { playingCtx } from '../helpers/ctx'

const spawnPlayer = (world: Parameters<typeof spawnConfiguredPlayer>[0]) => spawnConfiguredPlayer(world, config)

describe('invuln', () => {
  it('ticks the player invulnerability window down', () => {
    const ctx = playingCtx()
    const player = spawnPlayer(ctx.world)
    player.invuln!.remainingS = 0.5
    createInvuln().run(ctx)
    expect(player.invuln!.remainingS).toBeCloseTo(0.5 - ctx.dt)
  })

  it('clamps the window at zero', () => {
    const ctx = playingCtx()
    const player = spawnPlayer(ctx.world)
    player.invuln!.remainingS = ctx.dt / 2
    createInvuln().run(ctx)
    expect(player.invuln!.remainingS).toBe(0)
  })

  it('is inert when not playing', () => {
    const ctx = playingCtx()
    const player = spawnPlayer(ctx.world)
    player.invuln!.remainingS = 0.5
    ctx.store.dispatch({ type: 'paused' })
    createInvuln().run(ctx)
    expect(player.invuln!.remainingS).toBe(0.5)
  })
})
