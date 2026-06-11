import { describe, expect, it, vi } from 'vitest'
import { createWorld } from '../../src/ecs/world'
import { createTransform, type EngineEntity } from '../../src/ecs/components'
import { EventQueue } from '../../src/ecs/events'
import {
  registerPhysicsBodies, physicsStepSystem, physicsSyncSystem
} from '../../src/physics/systems'
import type { PhysicsEvent, PhysicsPort } from '../../src/physics/port'

function fakePort(overrides: Partial<PhysicsPort> = {}): PhysicsPort {
  return {
    addBody: vi.fn(), removeBody: vi.fn(), setGravity: vi.fn(),
    step: vi.fn(() => [] as PhysicsEvent[]),
    readPose: vi.fn(() => null), readLinearVelocity: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
    applyImpulse: vi.fn(), setKinematicTarget: vi.fn(),
    bodyCount: 0, dispose: vi.fn(),
    ...overrides
  }
}

const ballDef = { kind: 'dynamic' as const, shape: { type: 'sphere' as const, radius: 0.5 } }

describe('registerPhysicsBodies', () => {
  it('adds bodies for existing and future entities with rigidBody+transform', () => {
    const world = createWorld<EngineEntity>()
    const port = fakePort()
    const existing = world.add({ transform: createTransform({ x: 1, y: 2, z: 3 }), rigidBody: ballDef })
    registerPhysicsBodies(world, port)
    expect(port.addBody).toHaveBeenCalledWith(existing, ballDef,
      expect.objectContaining({ position: { x: 1, y: 2, z: 3 } }))

    const later = world.add({ transform: createTransform(), rigidBody: ballDef })
    expect(port.addBody).toHaveBeenCalledTimes(2)
    expect(port.addBody).toHaveBeenLastCalledWith(later, ballDef, expect.anything())
  })

  it('removes bodies when entities are removed', () => {
    const world = createWorld<EngineEntity>()
    const port = fakePort()
    registerPhysicsBodies(world, port)
    const entity = world.add({ transform: createTransform(), rigidBody: ballDef })
    world.remove(entity)
    expect(port.removeBody).toHaveBeenCalledWith(entity)
  })
})

describe('physicsStepSystem', () => {
  it('steps the port with ctx.dt and emits engine events', () => {
    const a = {}, b = {}
    const port = fakePort({
      step: vi.fn(() => [
        { kind: 'contact', started: true, a, b },
        { kind: 'sensor', started: true, a, b },
        { kind: 'sensor', started: false, a, b }
      ] as PhysicsEvent[])
    })
    const events = new EventQueue()
    const system = physicsStepSystem(port, events)
    expect(system.stage).toBe('physics')
    system.run({ dt: 1 / 60 })
    expect(port.step).toHaveBeenCalledWith(1 / 60)
    expect(events.read('contactStart')).toHaveLength(1)
    expect(events.read('sensorEnter')).toHaveLength(1)
    expect(events.read('sensorExit')).toHaveLength(1)
  })

  it('emits contactEnd for ended contact events', () => {
    const port = fakePort({
      step: vi.fn(() => [{ kind: 'contact', started: false, a: {}, b: {} }] as PhysicsEvent[])
    })
    const events = new EventQueue()
    physicsStepSystem(port, events).run({ dt: 1 / 60 })
    expect(events.read('contactEnd')).toHaveLength(1)
  })
})

describe('physicsSyncSystem', () => {
  it('copies current->prev then writes the new pose from the port', () => {
    const world = createWorld<EngineEntity>()
    const entity = world.add({ transform: createTransform({ x: 0, y: 5, z: 0 }), rigidBody: ballDef })
    const port = fakePort({
      readPose: vi.fn(() => ({
        position: { x: 0, y: 4.9, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }))
    })
    const system = physicsSyncSystem(port)
    expect(system.stage).toBe('postPhysics')
    system.run({ world })
    expect(entity.transform!.prevPosition).toEqual({ x: 0, y: 5, z: 0 })
    expect(entity.transform!.position).toEqual({ x: 0, y: 4.9, z: 0 })
  })

  it('leaves transforms unchanged when the port has no pose', () => {
    const world = createWorld<EngineEntity>()
    const entity = world.add({ transform: createTransform({ x: 0, y: 5, z: 0 }), rigidBody: ballDef })
    physicsSyncSystem(fakePort()).run({ world })
    expect(entity.transform!.position).toEqual({ x: 0, y: 5, z: 0 })
  })
})
