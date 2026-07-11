import { CORE_TYPE_IDS, type ProjectSnapshot } from '@automata/project'
import { describe, expect, it } from 'vitest'
import { compileMonkeyBallProject } from '../../src/project/compiler'
import { MONKEY_BALL_TYPE_IDS } from '../../src/project/types'
import { loadCanonicalProject } from '../helpers/project'

/** A minimal snapshot with a rotated cylinder — the one shape the shipped project omits. */
function cylinderSnapshot(): ProjectSnapshot {
  const transform = (
    position: { x: number; y: number; z: number },
    rotation = { x: 0, y: 0, z: 0 }
  ) => ({
    id: 'transform',
    typeId: CORE_TYPE_IDS.transform,
    data: { position, rotation, scale: { x: 1, y: 1, z: 1 } }
  })
  return {
    manifest: {
      formatVersion: 2, id: 'mb', name: 'MB', gameId: 'monkey-ball', entrySceneId: 's1',
      scenes: [{ id: 's1', path: 'scenes/s1.scene.json' }],
      resources: [
        { id: 'physics', typeId: MONKEY_BALL_TYPE_IDS.physics, path: 'resources/physics.resource.json' },
        { id: 'worlds', typeId: MONKEY_BALL_TYPE_IDS.worlds, path: 'resources/worlds.resource.json' }
      ]
    },
    scenes: {
      s1: {
        id: 's1', name: 'S1',
        entities: [
          { id: 'marker:spawn', name: 'Spawn', enabled: true, components: [
            transform({ x: 0, y: 1, z: 0 }),
            { id: 'spawn', typeId: MONKEY_BALL_TYPE_IDS.spawn, data: { timeLimitS: 60, fallY: -10 } }
          ] },
          { id: 'marker:goal', name: 'Goal', enabled: true, components: [
            transform({ x: 0, y: 0, z: -6 }),
            { id: 'goal', typeId: MONKEY_BALL_TYPE_IDS.goal, data: {} }
          ] },
          { id: 'geometry:0', name: 'Cyl', enabled: true, components: [
            transform({ x: 0, y: 0, z: 0 }, { x: Math.PI / 2, y: 0, z: 0 }),
            { id: 'primitive', typeId: CORE_TYPE_IDS.primitive, data: { shape: 'cylinder', size: { x: 4, y: 2, z: 4 } } },
            { id: 'surface', typeId: CORE_TYPE_IDS.surface, data: { color: '#abcdef' } },
            { id: 'collider', typeId: CORE_TYPE_IDS.collider, data: { shape: 'cylinder', friction: 0.5 } }
          ] }
        ]
      }
    },
    resources: {
      physics: { id: 'physics', typeId: MONKEY_BALL_TYPE_IDS.physics, data: { maxTiltRad: 0.2, tiltSmooth: 0.15, gravity: 9.81, ball: { radius: 0.5, friction: 0.6 } } },
      worlds: { id: 'worlds', typeId: MONKEY_BALL_TYPE_IDS.worlds, data: { worlds: [{ id: 'w', name: 'W', levels: ['s1'] }] } }
    }
  }
}

describe('compileMonkeyBallProject', () => {
  it('compiles every shipped level in world order', async () => {
    const project = await loadCanonicalProject()
    expect(Object.keys(project.levels)).toEqual(['w1-l1', 'w1-l2', 'w1-l3', 'w2-l1', 'w2-l2', 'w2-l3'])
    expect(project.levels['w1-l1']!.geometry.length).toBeGreaterThan(0)
  })

  it('reconstructs cylinder geometry with radius/height and non-zero rotation', () => {
    const geometry = compileMonkeyBallProject(cylinderSnapshot()).levels.s1!.geometry[0]!
    expect(geometry.shape).toBe('cylinder')
    if (geometry.shape === 'cylinder') {
      expect(geometry.radius).toBe(2) // size.x / 2
      expect(geometry.height).toBe(2) // size.y
    }
    expect(geometry.rot).toBeDefined()
  })
})
