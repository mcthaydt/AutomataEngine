import { describe, expect, it } from 'vitest'
import { EventQueue, createTransform, createWorld, type PhysicsPort, type Vec3 } from '@automata/engine'
import { createBumper } from '../../src/systems/bumper'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'

function fakePhysics() {
  const impulses: { entity: object; impulse: Vec3 }[] = []
  const port = {
    applyImpulse: (entity: object, impulse: Vec3) => { impulses.push({ entity, impulse }) },
    addBody() {}, removeBody() {}, setGravity() {}, step: () => [], readPose: () => null,
    readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), setKinematicTarget() {}, bodyCount: 0, dispose() {}
  } as unknown as PhysicsPort
  return { port, impulses }
}

const ctxOf = (): GameCtx => ({
  world: createWorld<Entity>(), store: createGameStore(), input: { x: 0, y: 0 }, dt: 1 / 60, alpha: 0
})

describe('bumper', () => {
  it('applies a radial impulse pushing the ball away from the bumper', () => {
    const { port, impulses } = fakePhysics()
    const events = new EventQueue()
    const ball: Entity = { ball: {}, transform: createTransform({ x: 2, y: 0.5, z: 0 }) }
    const bumper: Entity = { bumper: { impulseStrength: 8 }, transform: createTransform({ x: 0, y: 0.25, z: 0 }) }
    events.emit({ type: 'contactStart', a: ball, b: bumper })
    createBumper(port, events).run(ctxOf())
    expect(impulses).toHaveLength(1)
    expect(impulses[0]!.entity).toBe(ball)
    expect(impulses[0]!.impulse.x).toBeCloseTo(8)
    expect(impulses[0]!.impulse.y).toBe(0)
  })

  it('handles reversed event order and ignores non-bumper contacts', () => {
    const { port, impulses } = fakePhysics()
    const events = new EventQueue()
    const ball: Entity = { ball: {}, transform: createTransform({ x: 0, y: 0.5, z: 3 }) }
    const bumper: Entity = { bumper: { impulseStrength: 4 }, transform: createTransform({ x: 0, y: 0.25, z: 0 }) }
    const wall: Entity = { transform: createTransform() }
    events.emit({ type: 'contactStart', a: bumper, b: ball })
    events.emit({ type: 'contactStart', a: ball, b: wall })
    createBumper(port, events).run(ctxOf())
    expect(impulses).toHaveLength(1)
    expect(impulses[0]!.impulse.z).toBeCloseTo(4)
  })
})
