import { defineGameProject, type ProjectSnapshot } from '@automata/project'
import type { EditorProjectRegistration, ProjectPlayHandle } from '../../src/project/registration'

/**
 * A third, throwaway game registration used to prove the project editor is
 * fully generic. It registers a point-gizmo component and a tuning resource
 * with number/enum/color plus an object-array table. The compiler simply echoes
 * `{ snapshot }`, and preview/evaluation record their calls for assertions.
 */

export const previewCalls: string[] = []
export const evaluationCalls: Array<{ maxSteps: number }> = []

export interface FakeCompiled {
  snapshot: ProjectSnapshot
}

export function fakeSnapshot(): ProjectSnapshot {
  return {
    manifest: {
      formatVersion: 1, id: 'fake-demo', name: 'Fake Demo', gameId: 'fake', entrySceneId: 'main',
      scenes: [{ id: 'main', path: 'scenes/main.scene.json' }],
      resources: [{ id: 'tuning', typeId: 'fake.tuning', path: 'resources/tuning.resource.json' }]
    },
    scenes: {
      main: {
        formatVersion: 1, id: 'main', name: 'Main',
        entities: [{
          id: 'box', name: 'Box', enabled: true,
          components: [
            { id: 't', typeId: 'core.transform', data: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } },
            { id: 'p', typeId: 'core.primitive', data: { shape: 'box', size: { x: 1, y: 1, z: 1 } } },
            { id: 's', typeId: 'core.surface', data: { color: '#888888' } }
          ]
        }]
      }
    },
    resources: {
      tuning: { formatVersion: 1, id: 'tuning', typeId: 'fake.tuning', data: { speed: 4, mode: 'chase', tint: '#ffffff', waves: [] } }
    }
  }
}

export const fakeProjectDefinition = defineGameProject<FakeCompiled>({
  gameId: 'fake',
  label: 'Fake',
  createTemplate: fakeSnapshot,
  components: [{
    typeId: 'fake.spawn', label: 'Spawn',
    schema: { kind: 'object', fields: [{ key: 'team', label: 'Team', kind: 'enum', required: true, values: ['red', 'blue'] }] },
    defaultData: { team: 'red' },
    cardinality: { min: 0, max: 1 },
    gizmo: { kind: 'point', color: '#ffd166' }
  }],
  resources: [{
    typeId: 'fake.tuning', label: 'Tuning',
    schema: {
      kind: 'object',
      fields: [
        { key: 'speed', label: 'Speed', kind: 'number', required: true, min: 0 },
        { key: 'mode', label: 'Mode', kind: 'enum', required: true, values: ['chase', 'kite'] },
        { key: 'tint', label: 'Tint', kind: 'color', required: true },
        { key: 'waves', label: 'Waves', kind: 'array', presentation: 'table', item: { kind: 'object', fields: [{ key: 'count', label: 'Count', kind: 'number', required: true, min: 0 }] } }
      ]
    },
    defaultData: { speed: 4, mode: 'chase', tint: '#ffffff', waves: [] },
    singleton: true
  }],
  validate: () => [],
  compile: (snapshot) => ({ snapshot })
})

export const fakeEditorRegistration: EditorProjectRegistration<FakeCompiled> = {
  project: fakeProjectDefinition,
  prefabs: [
    {
      id: 'box', label: 'Box',
      components: [
        { typeId: 'core.transform', data: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } },
        { typeId: 'core.primitive', data: { shape: 'box', size: { x: 1, y: 1, z: 1 } } },
        { typeId: 'core.surface', data: { color: '#888888' } }
      ]
    },
    {
      id: 'spawn', label: 'Spawn',
      components: [
        { typeId: 'core.transform', data: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } },
        { typeId: 'fake.spawn', data: { team: 'red' } }
      ]
    }
  ],
  preview: {
    create: (_compiled, sceneId): ProjectPlayHandle => {
      previewCalls.push(`create:${sceneId}`)
      return {
        fixedUpdate: () => previewCalls.push('fixedUpdate'),
        render: () => previewCalls.push('render'),
        dispose: () => previewCalls.push('dispose')
      }
    }
  },
  evaluation: {
    evaluate: async (_snapshot, opts) => {
      evaluationCalls.push({ maxSteps: opts.maxSteps })
      return { outcome: 'passed', score: 1, metrics: { boxes: 1 }, steps: 1 }
    }
  }
}
