import type { GameProjectDefinition, ProjectSnapshot } from '../../src'

/**
 * Shared fixture for validation/bundle/files tests: a minimal but
 * fully-valid two-entity project plus its registration. Tests clone
 * `sampleSnapshot()` and mutate copies to exercise negative cases.
 */

export const sampleDefinition: GameProjectDefinition<{ ok: true }> = {
  gameId: 'fake',
  label: 'Fake',
  components: [{
    typeId: 'fake.spawn', label: 'Spawn',
    schema: {
      kind: 'object',
      fields: [
        { key: 'team', label: 'Team', kind: 'enum', required: true, values: ['red', 'blue'] },
        { key: 'tuning', label: 'Tuning', kind: 'reference', required: false, target: 'resource', typeIds: ['fake.tuning'] }
      ]
    },
    defaultData: { team: 'red', tuning: '' },
    cardinality: { min: 0, max: 1 }
  }],
  resources: [{
    typeId: 'fake.tuning', label: 'Tuning',
    schema: { kind: 'object', fields: [{ key: 'speed', label: 'Speed', kind: 'number', required: true, min: 0 }] },
    defaultData: { speed: 4 }, singleton: true
  }],
  createTemplate: () => sampleSnapshot(),
  validate: () => [],
  compile: () => ({ ok: true })
}

export function sampleSnapshot(): ProjectSnapshot {
  return {
    manifest: {
      formatVersion: 1, id: 'demo', name: 'Demo', gameId: 'fake', entrySceneId: 'main',
      scenes: [{ id: 'main', path: 'scenes/main.scene.json' }],
      resources: [{ id: 'tuning', typeId: 'fake.tuning', path: 'resources/tuning.resource.json' }]
    },
    scenes: {
      main: {
        formatVersion: 1, id: 'main', name: 'Main',
        entities: [
          {
            id: 'root', name: 'Root', enabled: true,
            components: [{ id: 'transform', typeId: 'core.transform', data: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }]
          },
          {
            id: 'spawn', name: 'Spawn', parentId: 'root', enabled: true,
            components: [{ id: 'c-spawn', typeId: 'fake.spawn', data: { team: 'red', tuning: 'tuning' } }]
          }
        ]
      }
    },
    resources: { tuning: { formatVersion: 1, id: 'tuning', typeId: 'fake.tuning', data: { speed: 4 } } }
  }
}
