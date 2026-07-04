import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { createProjectEditor, type EditorProjectRegistration, type ProjectEditorCore } from '@automata/editor'
import { defineGameProject, z, type ProjectSnapshot } from '@automata/project'

/** A small third-game project used by agent tests without game-specific behavior. */
export function fakeSnapshot(): ProjectSnapshot {
  return {
    manifest: {
      formatVersion: 1,
      id: 'fake-project',
      name: 'Fake Project',
      gameId: 'fake',
      entrySceneId: 'arena',
      scenes: [{ id: 'arena', path: 'scenes/arena.scene.json' }],
      resources: [{ id: 'waves', typeId: 'pulsebreak.wave-set', path: 'resources/waves.resource.json' }]
    },
    scenes: {
      arena: {
        formatVersion: 1,
        id: 'arena',
        name: 'Arena',
        entities: [{
          id: 'spawn-east',
          name: 'East Spawn',
          enabled: true,
          components: [{
            id: 'spawn-zone',
            typeId: 'pulsebreak.spawn-zone',
            data: { weight: 1 }
          }]
        }]
      }
    },
    resources: {
      waves: {
        formatVersion: 1,
        id: 'waves',
        typeId: 'pulsebreak.wave-set',
        data: { count: 3 }
      }
    }
  }
}

interface FakeCompiledProject {
  snapshot: ProjectSnapshot
}

export const fakeProjectDefinition = defineGameProject<FakeCompiledProject>({
  gameId: 'fake',
  label: 'Fake Project',
  createTemplate: fakeSnapshot,
  components: [{
    typeId: 'pulsebreak.spawn-zone',
    label: 'Spawn Zone',
    schema: z.strictObject({ weight: z.number().min(0).meta({ label: 'Weight' }) }),
    defaultData: { weight: 1 },
    cardinality: { min: 0, max: 1 }
  }],
  resources: [{
    typeId: 'pulsebreak.wave-set',
    label: 'Wave Set',
    schema: z.strictObject({ count: z.number().min(0).meta({ label: 'Count' }) }),
    defaultData: { count: 1 },
    singleton: true
  }],
  validate: () => [],
  compile: (snapshot) => ({ snapshot })
})

export function createFakeRegistration(
  scores: readonly number[] = [1]
): EditorProjectRegistration<FakeCompiledProject> {
  let evaluationIndex = 0
  return {
    project: fakeProjectDefinition,
    prefabs: [],
    evaluation: {
      evaluate: async (_snapshot, opts) => ({
        outcome: 'passed',
        score: scores[evaluationIndex++] ?? scores.at(-1) ?? 0,
        metrics: { maxSteps: opts.maxSteps },
        steps: opts.maxSteps
      })
    }
  }
}

export const fakeEditorRegistration = createFakeRegistration()

function nullPhysics(): PhysicsPort {
  return {
    addBody() {},
    removeBody() {},
    setGravity() {},
    step: () => [],
    readPose: () => null,
    readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }),
    applyImpulse() {},
    setKinematicTarget() {},
    get bodyCount() { return 0 },
    dispose() {}
  }
}

export function createFakeProjectEditor(options: {
  snapshot?: ProjectSnapshot
  scores?: readonly number[]
  evaluation?: boolean
} = {}): ProjectEditorCore {
  const registration = createFakeRegistration(options.scores)
  if (options.evaluation === false) delete registration.evaluation
  return createProjectEditor({
    registration,
    snapshot: options.snapshot ?? fakeSnapshot(),
    render: createNullRenderer().port,
    physics: nullPhysics()
  })
}
