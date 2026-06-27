import { describe, expect, it } from 'vitest'
import { createInvuln } from '../../src/systems/invuln'
import { spawnPlayer } from '../../src/sim/spawn'
import { playingCtx } from '../helpers/ctx'

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
