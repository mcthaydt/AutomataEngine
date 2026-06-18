import type { AudioPort, System } from '@automata/engine'
import type { GameCtx } from '../game/context'
import type { Level } from '../data/level'

/** Below the level's fall plane: lose a life and respawn (store rebuilds the run). */
export function createFallOff(level: Level, audio?: AudioPort): System<GameCtx> {
  return {
    name: 'fallOff',
    stage: 'postPhysics',
    run(ctx) {
      if (ctx.store.getState().scene !== 'playing') return
      const ball = ctx.world.with('ball', 'transform').first
      if (ball && ball.transform.position.y < level.fallY) {
        audio?.play('fall')
        ctx.store.dispatch({ type: 'ballFell' })
      }
    }
  }
}
