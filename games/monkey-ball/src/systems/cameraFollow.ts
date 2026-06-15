import { vec3, type PhysicsPort, type RenderPort, type System, type Vec3 } from '@automata/engine'
import type { GameCtx } from '../game/context'

const DISTANCE = 9
const HEIGHT = 6
const FOLLOW = 0.1

/** Smoothed chase camera behind the ball's travel direction. */
export function createCameraFollow(physics: PhysicsPort, render: RenderPort): System<GameCtx> {
  let cam: Vec3 | null = null
  return {
    name: 'cameraFollow',
    stage: 'render',
    run(ctx) {
      const ball = ctx.world.with('ball', 'transform').first
      if (!ball) return
      const pos = ball.transform.position
      const vel = physics.readLinearVelocity(ball)
      const horiz = { x: vel.x, y: 0, z: vel.z }
      const dir = vec3.length(horiz) > 0.5 ? vec3.normalize(horiz) : { x: 0, y: 0, z: -1 }
      const target = { x: pos.x - dir.x * DISTANCE, y: pos.y + HEIGHT, z: pos.z - dir.z * DISTANCE }
      cam = cam === null ? target : vec3.lerp(cam, target, FOLLOW)
      render.setCamera(cam, pos)
    }
  }
}
