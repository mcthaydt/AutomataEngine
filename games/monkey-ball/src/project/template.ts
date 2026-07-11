import { CORE_TYPE_IDS, type ComponentInstance, type EntityDocument, type ProjectSnapshot } from '@automata/project'
import { MONKEY_BALL_TYPE_IDS } from './types'

const ZERO = { x: 0, y: 0, z: 0 }
const ONE = { x: 1, y: 1, z: 1 }

function transform(position: { x: number; y: number; z: number }): ComponentInstance {
  return {
    id: 'transform',
    typeId: CORE_TYPE_IDS.transform,
    data: { position, rotation: { ...ZERO }, scale: { ...ONE } }
  }
}

function entity(
  id: string,
  name: string,
  position: { x: number; y: number; z: number },
  components: ComponentInstance[]
): EntityDocument {
  return { id, name, enabled: true, components: [transform(position), ...components] }
}

/** A small valid Monkey Ball project used by the shared editor's New Project action. */
export function createMonkeyBallTemplate(): ProjectSnapshot {
  return {
    manifest: {
      formatVersion: 2,
      id: 'monkey-ball',
      name: 'Monkey Ball',
      gameId: 'monkey-ball',
      entrySceneId: 'w1-l1',
      scenes: [{ id: 'w1-l1', path: 'scenes/w1-l1.scene.json' }],
      resources: [
        { id: 'physics', typeId: MONKEY_BALL_TYPE_IDS.physics, path: 'resources/physics.resource.json' },
        { id: 'worlds', typeId: MONKEY_BALL_TYPE_IDS.worlds, path: 'resources/worlds.resource.json' }
      ]
    },
    scenes: {
      'w1-l1': {
        id: 'w1-l1',
        name: 'First Roll',
        entities: [
          entity('marker:spawn', 'Spawn', { x: 0, y: 1, z: 6 }, [
            { id: 'spawn', typeId: MONKEY_BALL_TYPE_IDS.spawn, data: { timeLimitS: 60, fallY: -10 } }
          ]),
          entity('marker:goal', 'Goal', { x: 0, y: 0, z: -6 }, [
            { id: 'goal', typeId: MONKEY_BALL_TYPE_IDS.goal, data: {} }
          ]),
          entity('geometry:0', 'Box 1', { x: 0, y: -0.25, z: 0 }, [
            { id: 'primitive', typeId: CORE_TYPE_IDS.primitive, data: { shape: 'box', size: { x: 8, y: 0.5, z: 16 } } },
            { id: 'surface', typeId: CORE_TYPE_IDS.surface, data: { color: '#7ec850' } },
            { id: 'collider', typeId: CORE_TYPE_IDS.collider, data: { shape: 'box', friction: 0.6 } }
          ])
        ]
      }
    },
    resources: {
      physics: {
        id: 'physics',
        typeId: MONKEY_BALL_TYPE_IDS.physics,
        data: { maxTiltRad: (12 * Math.PI) / 180, tiltSmooth: 0.15, gravity: 9.81, ball: { radius: 0.5, friction: 0.6 } }
      },
      worlds: {
        id: 'worlds',
        typeId: MONKEY_BALL_TYPE_IDS.worlds,
        data: { worlds: [{ id: 'w1', name: 'Grassland', levels: ['w1-l1'] }] }
      }
    }
  }
}
