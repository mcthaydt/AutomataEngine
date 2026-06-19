import { describe, expect, it } from 'vitest'
import { EventQueue, createTransform, createWorld, type PhysicsPort, type Vec3 } from '@automata/engine'
import { createBumper } from '../../src/systems/bumper'
import type { FeedbackEvent } from '../../src/systems/feedback'
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

function playingCtx(): GameCtx {
  const store = createGameStore()
  store.dispatch({ type: 'levelStarted', levelId: 'x' })
  return { world: createWorld<Entity>(), store, input: { x: 0, y: 0 }, dt: 1 / 60, alpha: 0 }
}

describe('bumper', () => {
  it('applies a radial impulse pushing the ball away from the bumper', () => {
    const { port, impulses } = fakePhysics()
    const events = new EventQueue()
    const feedback = new EventQueue()
    const ball: Entity = { ball: {}, transform: createTransform({ x: 2, y: 0.5, z: 0 }) }
    const bumper: Entity = { bumper: { impulseStrength: 8 }, transform: createTransform({ x: 0, y: 0.25, z: 0 }) }
    events.emit({ type: 'contactStart', a: ball, b: bumper })
    createBumper(port, events, feedback).run(playingCtx())
    expect(impulses).toHaveLength(1)
    expect(impulses[0]!.entity).toBe(ball)
    expect(impulses[0]!.impulse.x).toBeCloseTo(8)
    expect(impulses[0]!.impulse.y).toBe(0)
  })

  it('emits a "bumped" feedback fact at the bumper position', () => {
    const { port } = fakePhysics()
    const events = new EventQueue()
    const feedback = new EventQueue()
    const ball: Entity = { ball: {}, transform: createTransform({ x: 2, y: 0.5, z: 0 }) }
    const bumper: Entity = { bumper: { impulseStrength: 8 }, transform: createTransform({ x: 0, y: 0.25, z: 0 }) }
    events.emit({ type: 'contactStart', a: ball, b: bumper })
    createBumper(port, events, feedback).run(playingCtx())
    expect(feedback.read<FeedbackEvent>('feedback')).toEqual([
      { type: 'feedback', kind: 'bumped', origin: { x: 0, y: 0.25, z: 0 } }
    ])
  })

  it('handles reversed event order and ignores non-bumper contacts', () => {
    const { port, impulses } = fakePhysics()
    const events = new EventQueue()
    const feedback = new EventQueue()
    const ball: Entity = { ball: {}, transform: createTransform({ x: 0, y: 0.5, z: 3 }) }
    const bumper: Entity = { bumper: { impulseStrength: 4 }, transform: createTransform({ x: 0, y: 0.25, z: 0 }) }
    const wall: Entity = { transform: createTransform() }
    events.emit({ type: 'contactStart', a: bumper, b: ball })
    events.emit({ type: 'contactStart', a: ball, b: wall })
    createBumper(port, events, feedback).run(playingCtx())
    expect(impulses).toHaveLength(1)
    expect(impulses[0]!.impulse.z).toBeCloseTo(4)
  })

  it('is inert once the scene is no longer playing', () => {
    const { port, impulses } = fakePhysics()
    const events = new EventQueue()
    const feedback = new EventQueue()
    const ctx = playingCtx()
    ctx.store.dispatch({ type: 'levelCompleted', levelId: 'x', timeMs: 1000, bananas: 0 })
    const ball: Entity = { ball: {}, transform: createTransform({ x: 2, y: 0.5, z: 0 }) }
    const bumper: Entity = { bumper: { impulseStrength: 8 }, transform: createTransform({ x: 0, y: 0.25, z: 0 }) }
    events.emit({ type: 'contactStart', a: ball, b: bumper })
    createBumper(port, events, feedback).run(ctx)
    expect(impulses).toHaveLength(0)
    expect(feedback.read('feedback')).toHaveLength(0)
  })
})
