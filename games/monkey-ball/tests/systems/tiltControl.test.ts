import { describe, expect, it } from 'vitest'
import { createNullRenderer, createWorld, type PhysicsPort, type Vec3 } from '@automata/engine'
import { createTiltControl } from '../../src/systems/tiltControl'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'
import type { PhysicsTuning } from '../../src/project/types'

const tuning: PhysicsTuning = {
  maxTiltRad: (12 * Math.PI) / 180, tiltSmooth: 0.5, gravity: 9.81, ball: { radius: 0.5, friction: 0.6 }
}

function fakePhysics(): { port: PhysicsPort; gravity: Vec3[] } {
  const gravity: Vec3[] = []
  const port = {
    setGravity: (g: Vec3) => { gravity.push(g) },
    addBody() {}, removeBody() {}, step: () => [], readPose: () => null,
    readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
    setKinematicTarget() {}, bodyCount: 0, dispose() {}
  } as unknown as PhysicsPort
  return { port, gravity }
}

function ctxWith(input: { x: number; y: number }): GameCtx {
  return { world: createWorld<Entity>(), store: createGameStore(), input, dt: 1 / 60, alpha: 0 }
}

describe('tiltControl', () => {
  it('tilting right pushes gravity toward +x', () => {
    const { port, gravity } = fakePhysics()
    const render = createNullRenderer()
    const sys = createTiltControl(port, render.port, render.port.createGroup(), tuning)
    const ctx = ctxWith({ x: 1, y: 0 })
    for (let i = 0; i < 60; i++) sys.run(ctx)
    const last = gravity.at(-1)!
    expect(last.x).toBeGreaterThan(0.1)
    expect(Math.abs(last.z)).toBeLessThan(1e-6)
  })

  it('tilting forward pushes gravity toward -z', () => {
    const { port, gravity } = fakePhysics()
    const render = createNullRenderer()
    const sys = createTiltControl(port, render.port, render.port.createGroup(), tuning)
    const ctx = ctxWith({ x: 0, y: 1 })
    for (let i = 0; i < 60; i++) sys.run(ctx)
    expect(gravity.at(-1)!.z).toBeLessThan(-0.1)
  })

  it('smooths toward the target instead of snapping', () => {
    const { port, gravity } = fakePhysics()
    const render = createNullRenderer()
    const sys = createTiltControl(port, render.port, render.port.createGroup(), tuning)
    const ctx = ctxWith({ x: 1, y: 0 })
    sys.run(ctx)
    const after1 = gravity.at(-1)!.x
    for (let i = 0; i < 60; i++) sys.run(ctx)
    const settled = gravity.at(-1)!.x
    expect(after1).toBeGreaterThan(0)
    expect(after1).toBeLessThan(settled - 1e-3)
  })

  it('rotates the cosmetic stage group by the negated tilt', () => {
    const { port } = fakePhysics()
    const render = createNullRenderer()
    const stage = render.port.createGroup()
    const sys = createTiltControl(port, render.port, stage, tuning)
    const ctx = ctxWith({ x: 1, y: 0 })
    for (let i = 0; i < 60; i++) sys.run(ctx)
    const rot = render.calls.filter((c) => c.op === 'setGroupRotation').at(-1)!
    expect(rot.group).toBe(stage)
    expect(rot.eulerRad!.z).toBeLessThan(0)
  })

  it('clamps combined tilt to the max angle', () => {
    const { port, gravity } = fakePhysics()
    const render = createNullRenderer()
    const sys = createTiltControl(port, render.port, render.port.createGroup(), tuning)
    const ctx = ctxWith({ x: 1, y: 1 })
    for (let i = 0; i < 120; i++) sys.run(ctx)
    const g = gravity.at(-1)!
    const angle = Math.acos(Math.min(1, -g.y / tuning.gravity))
    expect(angle).toBeLessThanOrEqual(tuning.maxTiltRad + 1e-6)
  })
})
