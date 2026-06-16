import { vec3, type RenderPort, type System, type Vec3 } from '@automata/engine'
import type { GameCtx } from '../game/context'

/** Fixed camera offset behind the stage's forward axis (+z), raised above the ball. */
const OFFSET = { x: 0, y: 6, z: 9 }
const FOLLOW = 0.1

/**
 * Follows the ball's position from a fixed orientation. The view never rotates with
 * the ball's velocity, so the input->screen mapping stays stable on a tilt-rolled ball
 * (controls are world-fixed) and the camera never whips around on direction reversals.
 */
export function createCameraFollow(render: RenderPort): System<GameCtx> {
  let cam: Vec3 | null = null
  return {
    name: 'cameraFollow',
    stage: 'render',
    run(ctx) {
      const ball = ctx.world.with('ball', 'transform').first
      if (!ball) return
      const pos = ball.transform.position
      const target = { x: pos.x + OFFSET.x, y: pos.y + OFFSET.y, z: pos.z + OFFSET.z }
      cam = cam === null ? target : vec3.lerp(cam, target, FOLLOW)
      render.setCamera(cam, pos)
    }
  }
}
