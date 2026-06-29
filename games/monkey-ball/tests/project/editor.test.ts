import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  archetypeLibraryKind,
  createNullRenderer,
  parseData,
  type PhysicsPort,
  type RigidBodyDef
} from '@automata/engine'
import { loadProjectFiles } from '@automata/project'
import { createMonkeyBallEditorRegistration } from '../../src/project/editor'
import { readDataFile } from '../helpers/data'

const projectRoot = resolve(import.meta.dirname, '../../public/project')
const snapshot = await loadProjectFiles({ readText: (path) => readFile(resolve(projectRoot, path), 'utf8') })
const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')

function recordingPhysics(): PhysicsPort & { bodies: RigidBodyDef[] } {
  const bodies: RigidBodyDef[] = []
  return {
    bodies,
    addBody(_entity, def) { bodies.push(def) },
    removeBody() {}, setGravity() {}, step: () => [], readPose: () => null,
    readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
    setKinematicTarget() {}, get bodyCount() { return bodies.length }, dispose() {}
  }
}

describe('Monkey Ball editor registration', () => {
  const registration = createMonkeyBallEditorRegistration(lib)

  it('exposes declarative geometry, archetype, spawn, and goal prefabs', () => {
    expect(registration.prefabs.map((prefab) => prefab.id)).toEqual([
      'box', 'cylinder', 'banana', 'bumper', 'moving-platform', 'spawn', 'goal'
    ])
    expect(registration).not.toHaveProperty('panels')
  })

  it('creates preview gameplay from the modified in-memory scene', () => {
    const edited = structuredClone(snapshot)
    const geometry = edited.scenes['w1-l1']!.entities.find((entity) => entity.id === 'geometry:0')!
    const primitive = geometry.components.find((component) => component.typeId === 'core.primitive')!
    ;(primitive.data as { size: { x: number; y: number; z: number } }).size = { x: 10, y: 1, z: 20 }
    const compiled = registration.project.compile(edited)
    const render = createNullRenderer()
    const physics = recordingPhysics()

    const preview = registration.preview!.create(compiled, 'w1-l1', render.port, physics)

    expect(render.calls.find((call) => call.op === 'add' && call.def?.primitive === 'box')?.def).toMatchObject({
      size: { x: 10, y: 1, z: 20 }
    })
    expect(physics.bodies.length).toBeGreaterThan(0)
    preview.dispose()
  })

  it('normalizes evaluation through the existing headless runner', async () => {
    await expect(registration.evaluation!.evaluate(snapshot, { maxSteps: 1 })).resolves.toMatchObject({
      outcome: 'incomplete',
      steps: 1,
      metrics: { falls: 0, bananas: 0 }
    })
  })
})
