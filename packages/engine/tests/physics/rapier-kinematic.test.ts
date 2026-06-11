import { describe, expect, it } from 'vitest'
import { createRapierPhysics } from '../../src/physics/rapier'
import { quat } from '../../src/math/quat'

const DT = 1 / 60
const at = (x: number, y: number, z: number) =>
  ({ position: { x, y, z }, rotation: quat.identity() })

describe('kinematic platform', () => {
  it('moves to its kinematic target', async () => {
    const physics = await createRapierPhysics()
    const platform = { name: 'platform' }
    physics.addBody(platform, {
      kind: 'kinematic', shape: { type: 'box', halfExtents: { x: 2, y: 0.25, z: 2 } }
    }, at(0, 0, 0))
    physics.setKinematicTarget(platform, { x: 1, y: 0, z: 0 })
    physics.step(DT)
    expect(physics.readPose(platform)!.position.x).toBeCloseTo(1, 3)
    physics.dispose()
  })

  it('carries a resting ball along (friction)', async () => {
    const physics = await createRapierPhysics()
    const platform = { name: 'platform' }, ball = { name: 'ball' }
    physics.addBody(platform, {
      kind: 'kinematic', shape: { type: 'box', halfExtents: { x: 3, y: 0.25, z: 3 } }, friction: 1.0
    }, at(0, 0, 0))
    physics.addBody(ball, {
      kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 }, friction: 1.0
    }, at(0, 0.75, 0))
    for (let i = 0; i < 30; i++) physics.step(DT)

    let px = 0
    for (let i = 0; i < 120; i++) {
      px += 0.6 * DT
      physics.setKinematicTarget(platform, { x: px, y: 0, z: 0 })
      physics.step(DT)
    }
    const ballX = physics.readPose(ball)!.position.x
    expect(ballX).toBeGreaterThan(0.15)
    physics.dispose()
  })
})
