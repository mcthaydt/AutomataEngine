import { defineGameProject, reference, z } from '../../src'
import type { GameProjectDefinitionInput, ProjectSnapshot } from '../../src'

/**
 * Shared fixture for validation/bundle/files tests: a minimal but
 * fully-valid two-entity project plus its registration. Tests clone
 * `sampleSnapshot()` and mutate copies to exercise negative cases;
 * ad-hoc variants spread `sampleDefinitionInput` back through
 * `defineGameProject`.
 */

export const sampleDefinitionInput: GameProjectDefinitionInput<{ ok: true }> = {
  gameId: 'fake',
  label: 'Fake',
  components: [{
    typeId: 'fake.spawn', label: 'Spawn',
    schema: z.strictObject({
      team: z.enum(['red', 'blue']).meta({ label: 'Team' }),
      tuning: reference({ target: 'resource', typeIds: ['fake.tuning'], label: 'Tuning' }).optional()
    }),
    defaultData: { team: 'red', tuning: '' },
    cardinality: { min: 0, max: 1 }
  }],
  resources: [{
    typeId: 'fake.tuning', label: 'Tuning',
    schema: z.strictObject({ speed: z.number().min(0).meta({ label: 'Speed' }) }),
    defaultData: { speed: 4 }, singleton: true
  }],
  createTemplate: () => sampleSnapshot(),
  validate: () => [],
  compile: () => ({ ok: true })
}

export const sampleDefinition = defineGameProject(sampleDefinitionInput)

export function sampleSnapshot(): ProjectSnapshot {
  return {
    manifest: {
      formatVersion: 2, id: 'demo', name: 'Demo', gameId: 'fake', entrySceneId: 'main',
      scenes: [{ id: 'main', path: 'scenes/main.scene.json' }],
      resources: [{ id: 'tuning', typeId: 'fake.tuning', path: 'resources/tuning.resource.json' }]
    },
    scenes: {
      main: {
        id: 'main', name: 'Main',
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
    resources: { tuning: { id: 'tuning', typeId: 'fake.tuning', data: { speed: 4 } } }
  }
}
