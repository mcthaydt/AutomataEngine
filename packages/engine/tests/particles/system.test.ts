import { describe, expect, it } from 'vitest'
import { createWorld } from '../../src/ecs/world'
import { createTransform, type EngineEntity } from '../../src/ecs/components'
import { particleSystem, spawnBurst } from '../../src/particles/system'

describe('particles', () => {
  it('spawns a burst of renderable, lifetimed particles at the origin', () => {
    const world = createWorld<EngineEntity>()
    spawnBurst(world, { origin: { x: 1, y: 2, z: 3 }, count: 8, speed: 2, lifetimeS: 0.5, color: '#fff' })
    const particles = [...world.with('particle', 'renderable', 'lifetime')]
    expect(particles).toHaveLength(8)
    expect(particles[0]!.transform!.position).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('moves particles by velocity and applies gravity', () => {
    const world = createWorld<EngineEntity>()
    world.add({
      transform: createTransform({ x: 0, y: 0, z: 0 }),
      renderable: { primitive: 'sphere', radius: 0.1, color: '#fff' },
      particle: { velocity: { x: 1, y: 0, z: 0 }, gravity: 10 },
      lifetime: { remainingS: 1 }
    })
    particleSystem().run({ world, dt: 0.1 })
    const p = [...world.with('particle')][0]!
    expect(p.transform!.position.x).toBeCloseTo(0.1)
    expect(p.particle!.velocity.y).toBeCloseTo(-1)
  })

  it('reaps particles once their lifetime elapses', () => {
    const world = createWorld<EngineEntity>()
    spawnBurst(world, { origin: { x: 0, y: 0, z: 0 }, count: 4, speed: 1, lifetimeS: 0.05, color: '#fff' })
    particleSystem().run({ world, dt: 0.1 })
    expect([...world.with('particle')]).toHaveLength(0)
  })

  it('honors explicit gravity and radius options', () => {
    const world = createWorld<EngineEntity>()
    spawnBurst(world, { origin: { x: 0, y: 0, z: 0 }, count: 2, speed: 1, lifetimeS: 1, color: '#abc', gravity: 3, radius: 0.2 })
    const p = [...world.with('particle', 'renderable')][0]!
    expect(p.particle!.gravity).toBe(3)
    expect((p.renderable as { radius: number }).radius).toBe(0.2)
  })
})
