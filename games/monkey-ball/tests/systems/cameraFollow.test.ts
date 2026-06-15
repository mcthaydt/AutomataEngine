import { describe, expect, it } from 'vitest'
import { createNullRenderer, createTransform, createWorld, type PhysicsPort, type Vec3 } from '@automata/engine'
import { createCameraFollow } from '../../src/systems/cameraFollow'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'

function physicsWithVel(vel: Vec3) {
  return {
    readLinearVelocity: () => vel, addBody() {}, removeBody() {}, setGravity() {}, step: () => [],
    readPose: () => null, applyImpulse() {}, setKinematicTarget() {}, bodyCount: 0, dispose() {}
  } as unknown as PhysicsPort
}

const ctxFor = (world: ReturnType<typeof createWorld<Entity>>): GameCtx => ({
  world, store: createGameStore(), input: { x: 0, y: 0 }, dt: 1 / 60, alpha: 0
})

describe('cameraFollow', () => {
  it('looks at the ball and sits behind its travel direction', () => {
    const render = createNullRenderer()
    const world = createWorld<Entity>()
    world.add({ ball: {}, transform: createTransform({ x: 0, y: 0.5, z: 0 }) })
    const sys = createCameraFollow(physicsWithVel({ x: 0, y: 0, z: -4 }), render.port)
    sys.run(ctxFor(world))
    const call = render.calls.filter((c) => c.op === 'setCamera').at(-1)!
    expect(call.lookAt).toEqual({ x: 0, y: 0.5, z: 0 })
    expect(call.position!.z).toBeGreaterThan(0)
    expect(call.position!.y).toBeGreaterThan(0.5)
  })

  it('smoothly approaches the target as the ball moves', () => {
    const render = createNullRenderer()
    const world = createWorld<Entity>()
    const ball = world.add({ ball: {}, transform: createTransform({ x: 0, y: 0.5, z: 0 }) })
    const sys = createCameraFollow(physicsWithVel({ x: 0, y: 0, z: 0 }), render.port)
    sys.run(ctxFor(world))
    const first = render.calls.filter((c) => c.op === 'setCamera').at(-1)!.position!.x
    ball.transform.position = { x: 20, y: 0.5, z: 0 }
    sys.run(ctxFor(world))
    const second = render.calls.filter((c) => c.op === 'setCamera').at(-1)!.position!.x
    expect(first).toBeCloseTo(0)
    expect(second).toBeGreaterThan(0)
    expect(second).toBeLessThan(20)
  })
})
