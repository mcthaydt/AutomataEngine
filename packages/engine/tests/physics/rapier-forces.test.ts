import { describe, expect, it } from 'vitest'
import { createRapierPhysics } from '../../src/physics/rapier'
import { quat } from '../../src/math/quat'

const DT = 1 / 60
const at = (x: number, y: number, z: number) =>
  ({ position: { x, y, z }, rotation: quat.identity() })

async function ballOnFloor() {
  const physics = await createRapierPhysics()
  const floor = { name: 'floor' }, ball = { name: 'ball' }
  physics.addBody(floor, {
    kind: 'fixed', shape: { type: 'box', halfExtents: { x: 50, y: 0.25, z: 50 } }, friction: 0.6
  }, at(0, -0.25, 0))
  physics.addBody(ball, {
    kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 }, friction: 0.6
  }, at(0, 0.5, 0))
  for (let i = 0; i < 30; i++) physics.step(DT)
  return { physics, ball }
}

describe('the tilt mechanic: rotated gravity', () => {
  it('ball at rest stays at rest under straight-down gravity', async () => {
    const { physics, ball } = await ballOnFloor()
    const before = physics.readPose(ball)!.position
    for (let i = 0; i < 60; i++) physics.step(DT)
    const after = physics.readPose(ball)!.position
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.01)
    expect(Math.abs(after.z - before.z)).toBeLessThan(0.01)
    physics.dispose()
  })

  it('tilting gravity makes the ball roll toward the tilt', async () => {
    const { physics, ball } = await ballOnFloor()
    const tilt = quat.fromEuler(0, 0, 12 * Math.PI / 180)
    physics.setGravity(quat.apply(tilt, { x: 0, y: -9.81, z: 0 }))
    for (let i = 0; i < 60; i++) physics.step(DT)
    const pose = physics.readPose(ball)!
    expect(pose.position.x).toBeGreaterThan(0.2)
    expect(physics.readLinearVelocity(ball).x).toBeGreaterThan(0.1)
    physics.dispose()
  })

  it('tilting gravity rolls a ball that has fallen asleep at rest', async () => {
    const { physics, ball } = await ballOnFloor()
    // Let the ball settle until Rapier puts it to sleep — the situation a player
    // hits when they return to a level and pause before pressing a key.
    for (let i = 0; i < 180; i++) physics.step(DT)
    const before = physics.readPose(ball)!.position

    const tilt = quat.fromEuler(0, 0, 12 * Math.PI / 180)
    physics.setGravity(quat.apply(tilt, { x: 0, y: -9.81, z: 0 }))
    for (let i = 0; i < 60; i++) physics.step(DT)

    const after = physics.readPose(ball)!.position
    expect(after.x - before.x).toBeGreaterThan(0.2)
    physics.dispose()
  })

  it('applyImpulse kicks the ball laterally', async () => {
    const { physics, ball } = await ballOnFloor()
    physics.applyImpulse(ball, { x: 0, y: 0, z: -2 })
    for (let i = 0; i < 10; i++) physics.step(DT)
    expect(physics.readPose(ball)!.position.z).toBeLessThan(-0.05)
    physics.dispose()
  })

  it('ball rolls off the edge of a floor and keeps falling', async () => {
    const physics = await createRapierPhysics()
    const floor = { name: 'floor' }, ball = { name: 'ball' }
    physics.addBody(floor, {
      kind: 'fixed', shape: { type: 'box', halfExtents: { x: 2, y: 0.25, z: 2 } }
    }, at(0, -0.25, 0))
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(1.2, 0.5, 0))
    const tilt = quat.fromEuler(0, 0, 15 * Math.PI / 180)
    physics.setGravity(quat.apply(tilt, { x: 0, y: -9.81, z: 0 }))
    let fellBelow = false
    for (let i = 0; i < 60 * 4 && !fellBelow; i++) {
      physics.step(DT)
      if (physics.readPose(ball)!.position.y < -2) fellBelow = true
    }
    expect(fellBelow).toBe(true)
    physics.dispose()
  })
})
