import { describe, expect, it } from 'vitest'
import { createWorld } from '../../src/ecs/world'
import { createTransform, type EngineEntity } from '../../src/ecs/components'
import { createNullRenderer } from '../../src/render/null'
import { registerRenderables, renderSystem } from '../../src/render/systems'

const ball = { primitive: 'sphere' as const, radius: 0.5, color: '#fff' }

describe('registerRenderables', () => {
  it('adds existing and future renderable entities to the port and removes on despawn', () => {
    const world = createWorld<EngineEntity>()
    const renderer = createNullRenderer()
    const existing = world.add({ transform: createTransform(), renderable: ball })
    registerRenderables(world, renderer.port)
    const later = world.add({ transform: createTransform(), renderable: ball })
    world.remove(existing)

    const ops = renderer.calls.map((call) => call.op)
    expect(ops).toEqual(['add', 'add', 'remove'])
    expect(renderer.calls[1]!.entity).toBe(later)
  })

  it('optionally parents all renderables to a group (stage tilt group)', () => {
    const world = createWorld<EngineEntity>()
    const renderer = createNullRenderer()
    const stage = renderer.port.createGroup()
    registerRenderables(world, renderer.port, stage)
    world.add({ transform: createTransform(), renderable: ball })
    expect(renderer.calls.at(-1)).toMatchObject({ op: 'add', group: stage })
  })
})

describe('renderSystem', () => {
  it('writes poses interpolated between prev and current at alpha', () => {
    const world = createWorld<EngineEntity>()
    const renderer = createNullRenderer()
    registerRenderables(world, renderer.port)
    const entity = world.add({ transform: createTransform({ x: 0, y: 0, z: 0 }), renderable: ball })
    entity.transform!.prevPosition = { x: 0, y: 0, z: 0 }
    entity.transform!.position = { x: 10, y: 0, z: 0 }

    const system = renderSystem(renderer.port)
    expect(system.stage).toBe('render')
    system.run({ world, alpha: 0.25 })

    const pose = renderer.calls.at(-1)!
    expect(pose.op).toBe('setPose')
    expect(pose.position).toEqual({ x: 2.5, y: 0, z: 0 })
  })
})
