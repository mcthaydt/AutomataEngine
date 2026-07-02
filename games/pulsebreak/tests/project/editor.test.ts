import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { loadEditorRegistration, pulsebreakEditorRegistration } from '../../src/project/editor'
import { loadHeadlessRegistration, pulsebreakProjectDefinition } from '../../src/project'
import { createPulsebreakTemplate } from '../../src/project/template'

const unusedDeps = { readText: () => Promise.reject(new Error('pulsebreak loaders read no data files')) }

function nullPhysics(): PhysicsPort {
  return {
    addBody() {}, removeBody() {}, setGravity() {}, step: () => [], readPose: () => null,
    readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
    setKinematicTarget() {}, bodyCount: 0, dispose() {}
  }
}

describe('Pulsebreak editor registration', () => {
  it('is declarative and exposes the shared editor prefabs without custom DOM', () => {
    expect(pulsebreakEditorRegistration).not.toHaveProperty('panels')
    expect(pulsebreakEditorRegistration.prefabs.map((prefab) => prefab.label)).toEqual([
      'Floor', 'Player Start', 'Spawn Zone'
    ])
    expect(JSON.stringify(pulsebreakEditorRegistration.prefabs)).not.toContain('<')
  })

  it('creates preview gameplay from the compiled unsaved snapshot', () => {
    const snapshot = createPulsebreakTemplate()
    const floor = snapshot.scenes.arena!.entities.find((entity) => entity.id === 'floor')!
    const primitive = floor.components.find((component) => component.typeId === 'core.primitive')!
    ;(primitive.data as { size: { x: number; y: number; z: number } }).size = { x: 9, y: 0.75, z: 11 }
    const compiled = pulsebreakEditorRegistration.project.compile(snapshot)
    const render = createNullRenderer()

    const preview = pulsebreakEditorRegistration.preview!.create(compiled, 'arena', render.port, nullPhysics())

    expect(render.calls.find((call) => call.op === 'add' && call.def?.primitive === 'box')?.def).toMatchObject({
      size: { x: 9, y: 0.75, z: 11 }
    })
    preview.dispose()
  })

  it('evaluates an unsaved wave mutation through normalized headless output', async () => {
    const snapshot = createPulsebreakTemplate()
    const waves = snapshot.resources.waves!.data as {
      waves: Array<{ spawns: Array<{ enemyTypeId: string; count: number }> }>
    }
    waves.waves[0]!.spawns[0]!.count = 1

    const result = await pulsebreakEditorRegistration.evaluation!.evaluate(snapshot, { maxSteps: 1 })

    expect(result).toMatchObject({
      outcome: 'incomplete',
      steps: 1,
      metrics: { enemiesRemaining: 1, wave: 1 }
    })
    expect(Number.isFinite(result.score)).toBe(true)
  })
})

describe('Pulsebreak registry loader convention', () => {
  it('exposes the conventional editor loader', async () => {
    await expect(loadEditorRegistration(unusedDeps)).resolves.toBe(pulsebreakEditorRegistration)
  })

  it('exposes the conventional headless loader without preview', async () => {
    const registration = await loadHeadlessRegistration(unusedDeps)
    expect(registration.project).toBe(pulsebreakProjectDefinition)
    expect(registration.preview).toBeUndefined()
    expect(registration.evaluation).toBeDefined()
  })
})
