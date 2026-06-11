import { describe, expect, it } from 'vitest'
import { createRapierPhysics } from '../../src/physics/rapier'
import { quat } from '../../src/math/quat'

const STEPS_PER_SECOND = 60
const DT = 1 / STEPS_PER_SECOND
const at = (x: number, y: number, z: number) =>
  ({ position: { x, y, z }, rotation: quat.identity() })

describe('createRapierPhysics', () => {
  it('tracks bodies and disposes cleanly', async () => {
    const physics = await createRapierPhysics()
    const ball = { name: 'ball' }
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 5, 0))
    expect(physics.bodyCount).toBe(1)
    physics.removeBody(ball)
    expect(physics.bodyCount).toBe(0)
    expect(physics.readPose(ball)).toBeNull()
    physics.dispose()
  })

  it('a dynamic ball free-falls under default gravity', async () => {
    const physics = await createRapierPhysics()
    const ball = { name: 'ball' }
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 10, 0))
    for (let i = 0; i < STEPS_PER_SECOND; i++) physics.step(DT)
    const pose = physics.readPose(ball)!
    expect(pose.position.y).toBeLessThan(10 - 3)
    expect(pose.position.y).toBeGreaterThan(10 - 7)
    physics.dispose()
  })

  it('a fixed box floor stops the falling ball', async () => {
    const physics = await createRapierPhysics()
    const floor = { name: 'floor' }, ball = { name: 'ball' }
    physics.addBody(floor, {
      kind: 'fixed',
      shape: { type: 'box', halfExtents: { x: 10, y: 0.25, z: 10 } }
    }, at(0, -0.25, 0))
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 3, 0))
    for (let i = 0; i < STEPS_PER_SECOND * 2; i++) physics.step(DT)
    const pose = physics.readPose(ball)!
    expect(pose.position.y).toBeCloseTo(0.5, 1)
    physics.dispose()
  })

  it('readLinearVelocity reports a falling ball moving down', async () => {
    const physics = await createRapierPhysics()
    const ball = { name: 'ball' }
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 10, 0))
    for (let i = 0; i < 10; i++) physics.step(DT)
    expect(physics.readLinearVelocity(ball).y).toBeLessThan(-0.5)
    physics.dispose()
  })
})
