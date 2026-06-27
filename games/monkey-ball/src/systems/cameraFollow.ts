import { vec3, type RenderPort, type System, type Vec3 } from '@automata/engine'
import type { GameCtx } from '../game/context'

/** Fixed camera offset behind the stage's forward axis (+z), raised above the ball. */
const OFFSET = { x: 0, y: 6, z: 9 }
/** Continuous response calibrated to preserve the former 0.1-per-frame feel at 60 Hz. */
const RESPONSE = -Math.log(1 - 0.1) * 60

/**
 * Follows the ball's position from a fixed orientation. The view never rotates with
 * the ball's velocity, so the input->screen mapping stays stable on a tilt-rolled ball
 * (controls are world-fixed) and the camera never whips around on direction reversals.
 *
 * The look-at trails the ball at the same rate as the eye, so eye - look stays a constant
 * OFFSET (orientation stays world-fixed) while a moving ball pulls ahead of screen center
 * — giving visual feedback of speed. It recenters once the ball comes to rest.
 */
export function createCameraFollow(render: RenderPort): System<GameCtx> {
  let cam: Vec3 | null = null
  let look: Vec3 | null = null
  return {
    name: 'cameraFollow',
    stage: 'render',
    run(ctx) {
      const ball = ctx.world.with('ball', 'transform').first
      if (!ball) return
      const pos = vec3.lerp(ball.transform.prevPosition, ball.transform.position, ctx.alpha)
      const target = { x: pos.x + OFFSET.x, y: pos.y + OFFSET.y, z: pos.z + OFFSET.z }
      const follow = 1 - Math.exp(-RESPONSE * Math.max(0, ctx.frameDt ?? 0))
      cam = cam === null ? target : vec3.lerp(cam, target, follow)
      look = look === null ? pos : vec3.lerp(look, pos, follow)
      render.setCamera(cam, look)
    }
  }
}
