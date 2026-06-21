import { describe, expect, it } from 'vitest'
import { DataLoadError, parseData } from '@automata/engine'
import { levelKind, worldsManifestKind } from '../../src/data/level'
import { readDataFile } from '../helpers/data'

describe('level schema', () => {
  it('parses the shipped w1-l1.json', () => {
    const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')
    expect(level.id).toBe('w1-l1')
    expect(level.timeLimitS).toBeGreaterThan(0)
    expect(level.geometry.length).toBeGreaterThan(0)
    expect(level.geometry[0]).toMatchObject({ shape: 'box', friction: 0.6 })
    expect(level.entities.some((e) => e.archetype === 'banana')).toBe(true)
  })

  it('defaults friction and accepts optional rot on geometry', () => {
    const level = parseData(levelKind, JSON.stringify({
      id: 'x', name: 'X', timeLimitS: 30, fallY: -10,
      spawn: [0, 1, 0], goal: { pos: [0, 0, -2] },
      geometry: [
        { shape: 'box', size: [4, 0.5, 4], pos: [0, 0, 0], rot: [0, 0, 10], color: '#fff' },
        { shape: 'cylinder', radius: 1, height: 0.5, pos: [2, 0, 0], color: '#fff', friction: 0.9 }
      ]
    }), 'x.json')
    expect(level.geometry[0]).toMatchObject({ friction: 0.6, rot: [0, 0, 10] })
    expect(level.geometry[1]).toMatchObject({ shape: 'cylinder', friction: 0.9 })
    expect(level.entities).toEqual([])
  })

  it('rejects a level without a goal', () => {
    expect(() => parseData(levelKind, JSON.stringify({
      id: 'x', name: 'X', timeLimitS: 30, fallY: -10, spawn: [0, 1, 0],
      geometry: [{ shape: 'box', size: [4, 1, 4], pos: [0, 0, 0], color: '#fff' }]
    }), 'x.json')).toThrow(DataLoadError)
  })

  it('parses the shipped worlds.json manifest', () => {
    const manifest = parseData(worldsManifestKind, readDataFile('levels/worlds.json'), 'worlds.json')
    expect(manifest.worlds).toHaveLength(2)
    expect(manifest.worlds[0]).toMatchObject({ id: 'w1', levels: ['w1-l1', 'w1-l2', 'w1-l3'] })
    expect(manifest.worlds[1]).toMatchObject({ id: 'w2', levels: ['w2-l1', 'w2-l2', 'w2-l3'] })
  })
})
