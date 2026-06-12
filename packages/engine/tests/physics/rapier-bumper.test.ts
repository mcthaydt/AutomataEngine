import { describe, expect, it } from 'vitest'
import { createRapierPhysics } from '../../src/physics/rapier'
import { quat } from '../../src/math/quat'

const DT = 1 / 60
const at = (x: number, y: number, z: number) =>
  ({ position: { x, y, z }, rotation: quat.identity() })

// Spec bumper: fixed cylinder, height 0.5 (halfHeight 0.25), radius 0.6.
// Centered at y 0.25 the top face spans y = 0.5, |xz| < 0.6.
const bumper = { name: 'bumper' }

describe('cylinder bumpers', () => {
  it('ball rests on the cylinder top inside its radius (halfHeight/radius not transposed)', async () => {
    const physics = await createRapierPhysics()
    const ball = { name: 'ball' }
    physics.addBody(bumper, {
      kind: 'fixed', shape: { type: 'cylinder', halfHeight: 0.25, radius: 0.6 }
    }, at(0, 0.25, 0))
    // x = 0.55 is on the top face only if the radius really is 0.6; with the
    // arguments transposed (radius 0.25) the ball would miss and fall forever.
    physics.addBody(ball, {
      kind: 'dynamic', shape: { type: 'sphere', radius: 0.25 }
    }, at(0.55, 1.2, 0))
    for (let i = 0; i < 120; i++) physics.step(DT)
    const pose = physics.readPose(ball)!
    expect(pose.position.y).toBeCloseTo(0.75, 1) // top (0.5) + ball radius (0.25)
    expect(Math.abs(pose.position.x - 0.55)).toBeLessThan(0.1)
    physics.dispose()
  })

  it('restitution > 1 bounces the ball back above its drop height', async () => {
    const physics = await createRapierPhysics()
    const ball = { name: 'ball' }
    physics.addBody(bumper, {
      kind: 'fixed', shape: { type: 'cylinder', halfHeight: 0.25, radius: 0.6 }, restitution: 1.2
    }, at(0, 0.25, 0))
    physics.addBody(ball, {
      kind: 'dynamic', shape: { type: 'sphere', radius: 0.25 }, restitution: 1.2
    }, at(0, 2, 0))
    let maxYAfterImpact = 0
    let impacted = false
    for (let i = 0; i < 60 * 3; i++) {
      physics.step(DT)
      if (physics.readLinearVelocity(ball).y > 0) impacted = true
      if (impacted) maxYAfterImpact = Math.max(maxYAfterImpact, physics.readPose(ball)!.position.y)
    }
    expect(impacted).toBe(true)
    expect(maxYAfterImpact).toBeGreaterThan(2) // energy gained: rises past the drop point
    physics.dispose()
  })
})
