import { describe, expect, it } from 'vitest'
import { createNullRenderer, type PhysicsPort } from '@automata/engine'
import { loadHeadlessRegistration } from '../../src/project'
import { compileProject } from '../../src/project/compiler'
import { editorRegistration, loadEditorRegistration } from '../../src/project/editor'
import { evaluateProject } from '../../src/project/evaluation'
import { createTemplate } from '../../src/project/template'

// Missing composition data is the expected plain-scaffold path.
const noCompositionDeps = { readText: () => Promise.reject(new Error('no composition data')) }

function nullPhysics(): PhysicsPort {
  return {
    addBody() {}, removeBody() {}, setGravity() {}, step: () => [], readPose: () => null,
    readLinearVelocity: () => ({ x: 0, y: 0, z: 0 }), applyImpulse() {},
    setKinematicTarget() {}, bodyCount: 0, dispose() {}
  }
}

describe('registry loader convention', () => {
  it('exposes the conventional editor and headless loaders', async () => {
    await expect(loadEditorRegistration(noCompositionDeps)).resolves.toBe(editorRegistration)
    const headless = await loadHeadlessRegistration(noCompositionDeps)
    expect(headless.project).toBe(editorRegistration.project)
    expect(headless.preview).toBeUndefined()
    expect(headless.evaluation).toBeDefined()
  })
})

describe('editor preview', () => {
  it('creates a self-driving preview from a compiled snapshot', () => {
    const compiled = compileProject(createTemplate())
    const render = createNullRenderer()
    const preview = editorRegistration.preview!.create(compiled, 'main', render.port, nullPhysics())
    for (let index = 0; index < 60; index += 1) preview.fixedUpdate(1 / 60)
    preview.render(0)
    expect(render.calls.some((call) => call.op === 'setPose')).toBe(true)
    preview.dispose()
    expect(render.port.objectCount).toBe(0)
  })
})

describe('headless evaluation', () => {
  it('passes the default template within the step budget', async () => {
    const result = await evaluateProject(createTemplate(), { maxSteps: 500 })
    expect(result.outcome).toBe('passed')
    expect(result.score).toBeGreaterThan(0)
    expect(result.steps).toBeLessThan(500)
  })

  it('reports incomplete when the budget is too small and failed past the time limit', async () => {
    await expect(evaluateProject(createTemplate(), { maxSteps: 1 })).resolves.toMatchObject({
      outcome: 'incomplete',
      score: 0
    })

    const hopeless = createTemplate()
    const data = hopeless.resources.tuning!.data as { timeLimitS: number }
    data.timeLimitS = 0.05
    await expect(evaluateProject(hopeless, { maxSteps: 100 })).resolves.toMatchObject({ outcome: 'failed' })
  })

  it('routes the scripted control through composed pack objectives first', async () => {
    const composition = {
      formatVersion: 1 as const,
      gameId: createTemplate().manifest.gameId,
      source: null,
      packs: [{
        id: 'interaction-inventory',
        version: '1.0.0',
        config: { interactRadius: 1.5, items: [{ id: 'item-1', position: { x: 0, z: 0 } }], iconPath: null }
      }],
      assets: []
    }
    const result = await evaluateProject(createTemplate(), { maxSteps: 2000 }, composition)
    expect(result.outcome).toBe('passed')
    expect(result.metrics.objectivesComplete).toBe(true)
  })
})
