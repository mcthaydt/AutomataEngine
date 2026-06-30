import { quat, type GroupId, type PhysicsPort, type RenderPort, type System } from '@automata/engine'
import type { GameCtx } from '../game/context'
import type { PhysicsTuning } from '../project/types'

/** input -> smoothed/clamped rotated gravity + counter-rotated cosmetic stage. */
export function createTiltControl(
  physics: PhysicsPort, render: RenderPort, stageGroup: GroupId, tuning: PhysicsTuning
): System<GameCtx> {
  let tiltX = 0
  let tiltZ = 0
  return {
    name: 'tiltControl',
    stage: 'update',
    run(ctx) {
      const max = tuning.maxTiltRad
      let targetX = ctx.input.y * max
      let targetZ = ctx.input.x * max
      const mag = Math.hypot(targetX, targetZ)
      if (mag > max) { targetX = (targetX / mag) * max; targetZ = (targetZ / mag) * max }
      tiltX += (targetX - tiltX) * tuning.tiltSmooth
      tiltZ += (targetZ - tiltZ) * tuning.tiltSmooth
      physics.setGravity(quat.apply(quat.fromEuler(tiltX, 0, tiltZ), { x: 0, y: -tuning.gravity, z: 0 }))
      render.setGroupRotation(stageGroup, { x: -tiltX, y: 0, z: -tiltZ })
    }
  }
}
