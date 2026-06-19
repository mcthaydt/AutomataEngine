import { describe, expect, it } from 'vitest'
import { createNullRenderer, createTransform, createWorld } from '@automata/engine'
import { createCameraFollow } from '../../src/systems/cameraFollow'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'

const ctxFor = (world: ReturnType<typeof createWorld<Entity>>, alpha = 1): GameCtx => ({
  world, store: createGameStore(), input: { x: 0, y: 0 }, dt: 1 / 60, alpha
})

describe('cameraFollow', () => {
  it('looks at the ball and sits behind it on the +z side', () => {
    const render = createNullRenderer()
    const world = createWorld<Entity>()
    world.add({ ball: {}, transform: createTransform({ x: 0, y: 0.5, z: 0 }) })
    const sys = createCameraFollow(render.port)
    sys.run(ctxFor(world))
    const call = render.calls.filter((c) => c.op === 'setCamera').at(-1)!
    expect(call.lookAt).toEqual({ x: 0, y: 0.5, z: 0 })
    expect(call.position!.z).toBeGreaterThan(0)
    expect(call.position!.y).toBeGreaterThan(0.5)
  })

  it('looks at the same interpolated ball pose that renderSystem presents', () => {
    const render = createNullRenderer()
    const world = createWorld<Entity>()
    const ball = world.add({ ball: {}, transform: createTransform({ x: 10, y: 0.5, z: 0 }) })
    ball.transform.prevPosition = { x: 0, y: 0.5, z: 0 }

    createCameraFollow(render.port).run(ctxFor(world, 0.25))

    const call = render.calls.filter((c) => c.op === 'setCamera').at(-1)!
    expect(call.lookAt).toEqual({ x: 2.5, y: 0.5, z: 0 })
    expect(call.position).toEqual({ x: 2.5, y: 6.5, z: 9 })
  })

  it('keeps a fixed orientation behind the ball on the +z side as it moves', () => {
    const render = createNullRenderer()
    const world = createWorld<Entity>()
    const ball = world.add({ ball: {}, transform: createTransform({ x: 0, y: 0.5, z: 0 }) })
    const sys = createCameraFollow(render.port)
    sys.run(ctxFor(world))
    // Ball reverses to travel toward +z; the camera must NOT swing to the -z side.
    ball.transform.position = { x: 0, y: 0.5, z: 5 }
    for (let i = 0; i < 60; i++) sys.run(ctxFor(world))
    const call = render.calls.filter((c) => c.op === 'setCamera').at(-1)!
    expect(call.position!.z).toBeGreaterThan(ball.transform.position.z)
    expect(call.lookAt).toEqual({ x: 0, y: 0.5, z: 5 })
  })

  it('smoothly approaches the target as the ball moves', () => {
    const render = createNullRenderer()
    const world = createWorld<Entity>()
    const ball = world.add({ ball: {}, transform: createTransform({ x: 0, y: 0.5, z: 0 }) })
    const sys = createCameraFollow(render.port)
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
