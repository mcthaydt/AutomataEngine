import { CORE_TYPE_IDS, type ComponentInstance, type EntityDocument, type ProjectSnapshot } from '@automata/project'
import { compilePulsebreakProject } from './compiler'
import { PULSEBREAK_TYPE_IDS, type PulsebreakCompiledProject } from './types'

/**
 * The default authored Pulsebreak project, in memory.
 *
 * Values are the authored parity baseline. The shipped `public/project` files
 * are generated from this template, and runtime/tests obtain
 * `defaultPulsebreakCompiledProject` through project compilation.
 */
const ZERO = { x: 0, y: 0, z: 0 }
const ONE = { x: 1, y: 1, z: 1 }

function transform(position: { x: number; y: number; z: number }): ComponentInstance {
  return { id: 'transform', typeId: CORE_TYPE_IDS.transform, data: { position, rotation: { ...ZERO }, scale: { ...ONE } } }
}

function entity(id: string, name: string, position: { x: number; y: number; z: number }, components: ComponentInstance[]): EntityDocument {
  return { id, name, enabled: true, components: [transform(position), ...components] }
}

export function createPulsebreakTemplate(): ProjectSnapshot {
  return {
    manifest: {
      formatVersion: 1, id: 'pulsebreak', name: 'Pulsebreak', gameId: 'pulsebreak', entrySceneId: 'arena',
      scenes: [{ id: 'arena', path: 'scenes/arena.scene.json' }],
      resources: [
        { id: 'tuning', typeId: PULSEBREAK_TYPE_IDS.tuning, path: 'resources/tuning.resource.json' },
        { id: 'enemies', typeId: PULSEBREAK_TYPE_IDS.enemyTypes, path: 'resources/enemies.resource.json' },
        { id: 'waves', typeId: PULSEBREAK_TYPE_IDS.waveSet, path: 'resources/waves.resource.json' },
        { id: 'upgrades', typeId: PULSEBREAK_TYPE_IDS.upgradeSet, path: 'resources/upgrades.resource.json' }
      ]
    },
    scenes: {
      arena: {
        formatVersion: 1, id: 'arena', name: 'Arena',
        entities: [
          entity('floor', 'Floor', { x: 0, y: -0.15, z: 0 }, [
            { id: 'primitive', typeId: CORE_TYPE_IDS.primitive, data: { shape: 'box', size: { x: 28, y: 0.3, z: 28 } } },
            { id: 'surface', typeId: CORE_TYPE_IDS.surface, data: { color: '#0a1124' } }
          ]),
          entity('player-start', 'Player Start', { x: 0, y: 0.5, z: 0 }, [
            { id: 'player-start', typeId: PULSEBREAK_TYPE_IDS.playerStart, data: {} }
          ]),
          entity('enemy-ring', 'Enemy Ring', { x: 0, y: 0.5, z: 0 }, [
            { id: 'spawn-zone', typeId: PULSEBREAK_TYPE_IDS.spawnZone, data: { mode: 'ring', radius: 13, weight: 1, enemies: ['rammer', 'shooter'], minSeparation: 0, edgePaddingMin: 1, edgePaddingMax: 3, angleJitterRad: 0.35 } }
          ]),
          entity('boss-north', 'Boss North', { x: 0, y: 0.5, z: -11 }, [
            { id: 'spawn-zone', typeId: PULSEBREAK_TYPE_IDS.spawnZone, data: { mode: 'point', radius: 0, weight: 1, enemies: ['boss'], minSeparation: 0, edgePaddingMin: 0, edgePaddingMax: 0, angleJitterRad: 0 } }
          ])
        ]
      }
    },
    resources: {
      tuning: {
        formatVersion: 1, id: 'tuning', typeId: PULSEBREAK_TYPE_IDS.tuning,
        data: {
          arena: { half: 13, y: 0.5 },
          camera: { eye: { x: 0, y: 24, z: 19 }, look: { x: 0, y: 0, z: 0 } },
          player: {
            radius: 0.6, startHealth: 100, baseDamage: 12, baseFireRate: 3, baseMoveSpeed: 8.5,
            projectileSpeed: 24, projectileRadius: 0.22, range: 26, invulnS: 0.6, color: '#27e0ff'
          },
          projectileLifetimeS: 3
        }
      },
      enemies: {
        formatVersion: 1, id: 'enemies', typeId: PULSEBREAK_TYPE_IDS.enemyTypes,
        data: {
          enemies: [
            { id: 'rammer', health: 18, radius: 0.6, speed: 4.6, contactDamage: 10, scoreValue: 100, color: '#ff2e88' },
            { id: 'shooter', health: 14, radius: 0.6, speed: 3, contactDamage: 6, scoreValue: 150, color: '#ffd23f', cooldownS: 1.3, projectileSpeed: 13, projectileDamage: 8, projectileRadius: 0.3, range: 24, preferredRange: 9 },
            { id: 'boss', health: 340, radius: 1.7, speed: 2.3, contactDamage: 20, scoreValue: 1000, color: '#b14cff', cooldownS: 1.6, projectileSpeed: 11, projectileDamage: 10, projectileRadius: 0.34, range: 40, burst: 10 }
          ]
        }
      },
      waves: {
        formatVersion: 1, id: 'waves', typeId: PULSEBREAK_TYPE_IDS.waveSet,
        data: {
          waves: [
            { id: 'wave-1', spawns: [{ enemyTypeId: 'rammer', count: 3 }] },
            { id: 'wave-2', spawns: [{ enemyTypeId: 'rammer', count: 3 }, { enemyTypeId: 'shooter', count: 1 }] },
            { id: 'wave-3', spawns: [{ enemyTypeId: 'rammer', count: 4 }, { enemyTypeId: 'shooter', count: 2 }] },
            { id: 'wave-4', spawns: [{ enemyTypeId: 'rammer', count: 5 }, { enemyTypeId: 'shooter', count: 3 }] },
            { id: 'wave-5', spawns: [{ enemyTypeId: 'boss', count: 1 }] }
          ]
        }
      },
      upgrades: {
        formatVersion: 1, id: 'upgrades', typeId: PULSEBREAK_TYPE_IDS.upgradeSet,
        data: {
          upgrades: [
            { id: 'damage', label: 'Overcharge', description: '+ pulse damage', step: 6 },
            { id: 'fireRate', label: 'Rapid Pulse', description: '+ fire rate', step: 1 },
            { id: 'moveSpeed', label: 'Thrusters', description: '+ move speed', step: 1.5 },
            { id: 'maxHealth', label: 'Reinforce', description: '+ max integrity & heal', step: 25 }
          ]
        }
      }
    }
  }
}

export function compilePulsebreakTemplate(): PulsebreakCompiledProject {
  return compilePulsebreakProject(createPulsebreakTemplate())
}

export const defaultPulsebreakCompiledProject: PulsebreakCompiledProject = compilePulsebreakTemplate()
