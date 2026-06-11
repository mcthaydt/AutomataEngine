import { describe, expect, it } from 'vitest'
import { createWorld } from '../../src/ecs/world'
import { createTransform, type EngineEntity } from '../../src/ecs/components'

interface TestEntity extends EngineEntity {
  collectible?: { value: number }
}

describe('createWorld', () => {
  it('adds, queries, and removes entities', () => {
    const world = createWorld<TestEntity>()
    const banana = world.add({ transform: createTransform(), collectible: { value: 1 } })
    world.add({ transform: createTransform() })

    const collectibles = world.with('collectible')
    expect([...collectibles].length).toBe(1)

    world.remove(banana)
    expect([...collectibles].length).toBe(0)
  })

  it('query archetypes update when components are added/removed at runtime', () => {
    const world = createWorld<TestEntity>()
    const entity = world.add({ transform: createTransform() })
    const collectibles = world.with('collectible')
    expect([...collectibles].length).toBe(0)
    world.addComponent(entity, 'collectible', { value: 2 })
    expect([...collectibles].length).toBe(1)
    world.removeComponent(entity, 'collectible')
    expect([...collectibles].length).toBe(0)
  })
})

describe('createTransform', () => {
  it('defaults to origin/identity with prev matching current', () => {
    const t = createTransform()
    expect(t.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(t.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 })
    expect(t.prevPosition).toEqual(t.position)
    expect(t.prevPosition).not.toBe(t.position)
    expect(t.prevRotation).toEqual(t.rotation)
  })

  it('accepts initial position and rotation', () => {
    const t = createTransform({ x: 1, y: 2, z: 3 })
    expect(t.position).toEqual({ x: 1, y: 2, z: 3 })
    expect(t.prevPosition).toEqual({ x: 1, y: 2, z: 3 })
  })
})
