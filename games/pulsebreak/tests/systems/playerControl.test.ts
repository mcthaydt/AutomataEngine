import { describe, expect, it } from 'vitest'
import { createPlayerControl } from '../../src/systems/playerControl'
import { spawnPlayer } from '../../src/sim/spawn'
import { ARENA, PLAYER } from '../../src/config'
import { playingCtx } from '../helpers/ctx'

describe('playerControl', () => {
  it('moves the drone right and forward from input', () => {
    const ctx = playingCtx({ input: { x: 1, y: 1 } })
    const player = spawnPlayer(ctx.world)
    createPlayerControl().run(ctx)
    const moved = PLAYER.baseMoveSpeed * ctx.dt
    expect(player.transform!.position.x).toBeCloseTo(moved)
    // forward (y=+1) travels away from the camera, i.e. toward -z
    expect(player.transform!.position.z).toBeCloseTo(-moved)
  })

  it('records prevPosition for render interpolation', () => {
    const ctx = playingCtx({ input: { x: 1, y: 0 } })
    const player = spawnPlayer(ctx.world)
    createPlayerControl().run(ctx)
    expect(player.transform!.prevPosition).toEqual(PLAYER.spawn)
  })

  it('clamps the drone to the arena bounds', () => {
    const ctx = playingCtx({ input: { x: 1, y: 0 } })
    const player = spawnPlayer(ctx.world)
    player.transform!.position = { x: ARENA.half - 0.01, y: ARENA.y, z: 0 }
    createPlayerControl().run(ctx)
    expect(player.transform!.position.x).toBe(ARENA.half)
  })

  it('is inert when not playing', () => {
    const ctx = playingCtx({ input: { x: 1, y: 0 } })
    const player = spawnPlayer(ctx.world)
    ctx.store.dispatch({ type: 'paused' })
    createPlayerControl().run(ctx)
    expect(player.transform!.position).toEqual(PLAYER.spawn)
  })

  it('does nothing when there is no player', () => {
    const ctx = playingCtx({ input: { x: 1, y: 0 } })
    expect(() => createPlayerControl().run(ctx)).not.toThrow()
  })
})
