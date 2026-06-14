import { describe, expect, it } from 'vitest'
import {
  archetypeLibraryKind, createTransform, createWorld, parseData, spawnFromArchetype
} from '@automata/engine'
import type { Entity } from '../../src/entity'
import { readDataFile } from '../helpers/data'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')

describe('standard archetype library', () => {
  it('defines the five game archetypes', () => {
    expect(Object.keys(lib).sort()).toEqual(
      ['ball', 'banana', 'bumper', 'goal', 'moving-platform'].sort()
    )
  })

  it('spawns a dynamic ball with sphere body and renderable', () => {
    const world = createWorld<Entity>()
    const ball = spawnFromArchetype<Entity>(world, lib, 'ball', {
      transform: createTransform({ x: 0, y: 1, z: 6 })
    })
    expect(ball.ball).toEqual({})
    expect(ball.rigidBody).toMatchObject({ kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } })
    expect(ball.renderable).toMatchObject({ primitive: 'sphere' })
    expect(ball.transform!.position).toEqual({ x: 0, y: 1, z: 6 })
  })

  it('spawns a banana as a fixed sensor with spinAnim', () => {
    const world = createWorld<Entity>()
    const banana = spawnFromArchetype<Entity>(world, lib, 'banana', {
      transform: createTransform({ x: 0, y: 0.6, z: 2 })
    })
    expect(banana.collectible).toEqual({ value: 1 })
    expect(banana.rigidBody).toMatchObject({ kind: 'fixed', sensor: true })
    expect(banana.spinAnim).toEqual({ speed: 2 })
  })

  it('spawns goal as a sensor and bumper with restitution + impulseStrength', () => {
    const world = createWorld<Entity>()
    const goal = spawnFromArchetype<Entity>(world, lib, 'goal', {})
    const bumper = spawnFromArchetype<Entity>(world, lib, 'bumper', {})
    expect(goal.goal).toEqual({})
    expect(goal.rigidBody).toMatchObject({ kind: 'fixed', sensor: true })
    expect(bumper.bumper).toEqual({ impulseStrength: 8 })
    expect(bumper.rigidBody).toMatchObject({ kind: 'fixed', restitution: 1.2 })
  })

  it('spawns a kinematic moving platform with pingpong defaults', () => {
    const world = createWorld<Entity>()
    const platform = spawnFromArchetype<Entity>(world, lib, 'moving-platform', {})
    expect(platform.movingPlatform).toEqual({ waypoints: [], speed: 1, mode: 'pingpong' })
    expect(platform.rigidBody).toMatchObject({ kind: 'kinematic' })
  })
})
