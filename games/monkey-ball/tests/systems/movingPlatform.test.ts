import { describe, expect, it } from 'vitest'
import { createTransform, createWorld, type PhysicsPort, type Vec3 } from '@automata/engine'
import { createMovingPlatform } from '../../src/systems/movingPlatform'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'

function fakePhysics() {
  const targets: { entity: object; position: Vec3 }[] = []
  const port = {
    setKinematicTarget: (entity: object, position: Vec3) => { targets.push({ entity, position }) },
    addBody() {}, removeBody() {}, setGravity() {}, step: () => [], readPose: () => null,
    readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {}, bodyCount: 0, dispose() {}
  } as unknown as PhysicsPort
  return { port, targets }
}

describe('movingPlatform', () => {
  it('advances the platform along its waypoints by speed*dt', () => {
    const { port, targets } = fakePhysics()
    const world = createWorld<Entity>()
    world.add({
      movingPlatform: { waypoints: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], speed: 5, mode: 'loop' },
      transform: createTransform()
    })
    const ctx: GameCtx = { world, store: createGameStore(), input: { x: 0, y: 0 }, dt: 0.2, alpha: 0 }
    const sys = createMovingPlatform(port)
    sys.run(ctx)
    sys.run(ctx)
    expect(targets.at(-1)!.position).toEqual({ x: 2, y: 0, z: 0 })
  })

  it('skips platforms with no waypoints', () => {
    const { port, targets } = fakePhysics()
    const world = createWorld<Entity>()
    world.add({ movingPlatform: { waypoints: [], speed: 1, mode: 'pingpong' }, transform: createTransform() })
    const ctx: GameCtx = { world, store: createGameStore(), input: { x: 0, y: 0 }, dt: 1, alpha: 0 }
    createMovingPlatform(port).run(ctx)
    expect(targets).toHaveLength(0)
  })
})
