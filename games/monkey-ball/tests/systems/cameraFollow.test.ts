import { describe, expect, it } from 'vitest'
import { createNullRenderer, createTransform, createWorld } from '@automata/engine'
import { createCameraFollow } from '../../src/systems/cameraFollow'
import { createGameStore } from '../../src/state/root'
import type { Entity } from '../../src/entity'
import type { GameCtx } from '../../src/game/context'

const ctxFor = (
  world: ReturnType<typeof createWorld<Entity>>,
  alpha = 1,
  frameDt = 1 / 60
): GameCtx & { frameDt: number } => ({
  world, store: createGameStore(), input: { x: 0, y: 0 }, dt: 1 / 60, alpha, frameDt
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
    // Look-at converges on the (now steady) ball; the camera stays on the +z side.
    expect(call.lookAt!.x).toBeCloseTo(0)
    expect(call.lookAt!.y).toBeCloseTo(0.5)
    expect(call.lookAt!.z).toBeCloseTo(5, 1)
  })

  it('lets the ball drift off-center toward travel while it is moving', () => {
    const render = createNullRenderer()
    const world = createWorld<Entity>()
    const ball = world.add({ ball: {}, transform: createTransform({ x: 0, y: 0.5, z: 0 }) })
    const sys = createCameraFollow(render.port)
    // Ball rolls steadily toward +z, advancing one unit per frame.
    for (let i = 0; i < 30; i++) {
      ball.transform.prevPosition = ball.transform.position
      ball.transform.position = { x: 0, y: 0.5, z: ball.transform.position.z + 1 }
      sys.run(ctxFor(world))
    }
    const call = render.calls.filter((c) => c.op === 'setCamera').at(-1)!
    // The look-at trails the ball's true z, so the ball sits ahead of screen center.
    expect(call.lookAt!.z).toBeLessThan(ball.transform.position.z)
  })

  it('recenters the look-at on the ball after it stops', () => {
    const render = createNullRenderer()
    const world = createWorld<Entity>()
    const ball = world.add({ ball: {}, transform: createTransform({ x: 0, y: 0.5, z: 0 }) })
    const sys = createCameraFollow(render.port)
    for (let i = 0; i < 30; i++) {
      ball.transform.prevPosition = ball.transform.position
      ball.transform.position = { x: 0, y: 0.5, z: ball.transform.position.z + 1 }
      sys.run(ctxFor(world))
    }
    // Ball halts; hold position so the trailing look-at can catch back up.
    ball.transform.prevPosition = ball.transform.position
    for (let i = 0; i < 200; i++) sys.run(ctxFor(world))
    const call = render.calls.filter((c) => c.op === 'setCamera').at(-1)!
    expect(call.lookAt!.z).toBeCloseTo(ball.transform.position.z, 1)
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

  it('reaches the same camera pose after equal time at different refresh rates', () => {
    const simulate = (frames: number) => {
      const render = createNullRenderer()
      const world = createWorld<Entity>()
      const ball = world.add({ ball: {}, transform: createTransform({ x: 0, y: 0.5, z: 0 }) })
      const system = createCameraFollow(render.port)
      system.run(ctxFor(world, 1, 0))
      ball.transform.prevPosition = ball.transform.position
      ball.transform.position = { x: 20, y: 0.5, z: -10 }
      for (let frame = 0; frame < frames; frame++) {
        system.run(ctxFor(world, 1, 1 / frames))
      }
      return render.calls.filter((call) => call.op === 'setCamera').at(-1)!
    }

    const at60Hz = simulate(60)
    const at120Hz = simulate(120)
    expect(at60Hz.position!.x).toBeCloseTo(at120Hz.position!.x, 5)
    expect(at60Hz.position!.z).toBeCloseTo(at120Hz.position!.z, 5)
    expect(at60Hz.lookAt!.x).toBeCloseTo(at120Hz.lookAt!.x, 5)
    expect(at60Hz.lookAt!.z).toBeCloseTo(at120Hz.lookAt!.z, 5)
  })
})
