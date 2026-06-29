import type { System } from '@automata/engine'
import { clampToArena } from '../sim/arena'
import { isPlaying, type GameCtx } from '../game/context'

/**
 * Kinematic hover-drone control on the XZ plane. Controls are world-fixed:
 * input.x → +x (screen right), input.y → -z (away from the fixed camera).
 */
export function createPlayerControl(): System<GameCtx> {
  return {
    name: 'playerControl',
    stage: 'update',
    run(ctx) {
      if (!isPlaying(ctx)) return
      const player = ctx.world.with('player', 'transform', 'velocity').first
      if (!player) return
      const speed = ctx.store.getState().run.moveSpeed
      const t = player.transform
      player.velocity = { x: ctx.input.x * speed, y: 0, z: -ctx.input.y * speed }
      t.prevPosition = t.position
      t.position = clampToArena({
        x: t.position.x + player.velocity.x * ctx.dt,
        y: t.position.y,
        z: t.position.z + player.velocity.z * ctx.dt
      }, ctx.config)
    }
  }
}
