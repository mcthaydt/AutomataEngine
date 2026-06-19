import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData, quat } from '@automata/engine'
import { buildLevelWorld } from '../../src/level/buildWorld'
import { levelKind } from '../../src/data/level'
import { readDataFile } from '../helpers/data'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')

describe('buildLevelWorld', () => {
  it('places the ball at the level spawn as a dynamic body', () => {
    const { world, ball } = buildLevelWorld(level, lib)
    expect(ball.transform!.position).toEqual({ x: 0, y: 1, z: 6 })
    expect(ball.rigidBody!.kind).toBe('dynamic')
    expect([...world.with('ball')]).toHaveLength(1)
  })

  it('creates one fixed floor body from box geometry, halved into half-extents', () => {
    const { world } = buildLevelWorld(level, lib)
    const floors = [...world.with('rigidBody', 'renderable')].filter(
      (e) => e.rigidBody!.kind === 'fixed' && e.rigidBody!.shape.type === 'box'
    )
    expect(floors).toHaveLength(1)
    expect(floors[0]!.rigidBody!.shape).toEqual({ type: 'box', halfExtents: { x: 4, y: 0.25, z: 8 } })
  })

  it('spawns the goal and the level entities (bananas, bumper)', () => {
    const { world } = buildLevelWorld(level, lib)
    expect([...world.with('goal')]).toHaveLength(1)
    expect([...world.with('collectible')]).toHaveLength(2)
    expect([...world.with('bumper')]).toHaveLength(1)
  })

  it('maps geometry rot degrees onto the transform rotation', () => {
    const ramp = {
      ...level, entities: [],
      geometry: [{
        shape: 'box' as const, size: [4, 0.5, 4] as [number, number, number],
        pos: [0, 0, 0] as [number, number, number], rot: [0, 0, 90] as [number, number, number],
        color: '#fff', friction: 0.6
      }]
    }
    const { world } = buildLevelWorld(ramp, lib)
    const floor = [...world.with('rigidBody', 'transform')].find((e) => e.rigidBody!.shape.type === 'box')!
    expect(floor.transform!.rotation).toEqual(quat.fromEuler(0, 0, (90 * Math.PI) / 180))
  })
})
