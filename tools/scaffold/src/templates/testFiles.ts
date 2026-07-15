/** Generated unit tests and the e2e smoke. They must pass untouched at the 90% gate. */

export function simTest(): string {
  return `import { describe, expect, it } from 'vitest'
import { createInitialState, seekGoal, step, type SimTuning } from '../../src/sim/sim'

const tuning: SimTuning = { arenaHalf: 12, moveSpeed: 6, goal: { x: 8, z: 8 }, goalRadius: 1.5, timeLimitS: 30 }
const dt = 1 / 60

function run(t: SimTuning, maxSteps: number) {
  let state = createInitialState({ x: -8, z: -8 })
  let steps = 0
  while (steps < maxSteps && state.status === 'running') {
    state = step(state, seekGoal(state, t), dt, t)
    steps += 1
  }
  return { state, steps }
}

describe('sim', () => {
  it('is deterministic for identical inputs', () => {
    expect(run(tuning, 500)).toEqual(run(tuning, 500))
  })

  it('reaches the goal with the default tuning', () => {
    const { state, steps } = run(tuning, 500)
    expect(state.status).toBe('succeeded')
    expect(steps).toBeLessThan(500)
    expect(state.elapsedS).toBeCloseTo(steps * dt)
  })

  it('fails once the time limit passes', () => {
    const { state } = run({ ...tuning, timeLimitS: 0.05 }, 10)
    expect(state.status).toBe('failed')
  })

  it('is a no-op after a terminal state', () => {
    const { state } = run(tuning, 500)
    expect(step(state, { x: 1, z: 0 }, dt, tuning)).toBe(state)
  })

  it('normalizes oversized control and clamps to the arena', () => {
    const start = createInitialState({ x: 12, z: 0 })
    const moved = step(start, { x: 3, z: 4 }, 1, { ...tuning, timeLimitS: 100 })
    expect(moved.position.x).toBe(12)
    expect(moved.position.z).toBeCloseTo(4.8)
    expect(moved.status).toBe('running')
  })

  it('stops seeking once at the goal', () => {
    expect(seekGoal(createInitialState({ x: 8, z: 8 }), tuning)).toEqual({ x: 0, z: 0 })
  })
})
`
}

export function gameplayTest(): string {
  return `import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameplay } from '../../src/game/gameplay'
import { compileProject } from '../../src/project/compiler'
import { createTemplate } from '../../src/project/template'
import { seekGoal } from '../../src/sim/sim'

describe('gameplay', () => {
  const compiled = compileProject(createTemplate())

  it('adds floor, goal, and player renderables with authored colors, and removes them on dispose', () => {
    const render = createNullRenderer()
    const game = createGameplay({ compiled, render: render.port, control: () => ({ x: 0, z: 0 }) })
    const adds = render.calls.filter((call) => call.op === 'add')
    expect(adds.map((call) => call.def?.primitive)).toEqual(['box', 'cylinder', 'sphere'])
    expect(adds[0]?.def?.color).toBe(compiled.colors.floor)
    expect(render.calls.some((call) => call.op === 'setCamera')).toBe(true)
    game.dispose()
    expect(render.port.objectCount).toBe(0)
  })

  it('advances the sim each fixed step and poses the player on render', () => {
    const render = createNullRenderer()
    const game = createGameplay({
      compiled,
      render: render.port,
      control: (state) => seekGoal(state, compiled.tuning)
    })
    const before = game.state
    game.fixedUpdate(1 / 60)
    expect(game.state.position).not.toEqual(before.position)

    render.calls.length = 0
    game.render(0)
    const pose = render.calls.find((call) => call.op === 'setPose')
    expect(pose?.position).toMatchObject({ x: game.state.position.x, z: game.state.position.z })
    game.dispose()
  })

  it('holds success while the objective gate is closed and releases when it opens', () => {
    const render = createNullRenderer()
    let gateOpen = false
    const game = createGameplay({
      compiled,
      render: render.port,
      control: (state) => seekGoal(state, compiled.tuning),
      objectiveGate: () => gateOpen
    })
    for (let index = 0; index < 600 && game.state.status === 'running'; index += 1) game.fixedUpdate(1 / 60)
    expect(game.state.status).toBe('running')
    gateOpen = true
    for (let index = 0; index < 600 && game.state.status === 'running'; index += 1) game.fixedUpdate(1 / 60)
    expect(game.state.status).toBe('succeeded')
    game.dispose()
  })
})
`
}

export function definitionTest(name: string): string {
  return `import { describe, expect, it } from 'vitest'
import { validateProject, type ProjectSnapshot } from '@automata/project'
import { projectDefinition } from '../../src'
import { compileProject } from '../../src/project/compiler'
import { createTemplate } from '../../src/project/template'

const codes = (snapshot: ProjectSnapshot): string[] =>
  validateProject(projectDefinition, snapshot).map((issue) => issue.code)

describe('project definition', () => {
  it('validates and compiles the template cleanly', () => {
    const snapshot = createTemplate()
    expect(validateProject(projectDefinition, snapshot)).toEqual([])
    const compiled = compileProject(snapshot)
    expect(compiled.spawn).toEqual({ x: -8, z: -8 })
    expect(compiled.tuning.goal).toEqual({ x: 8, z: 8 })
    expect(projectDefinition.compile(snapshot)).toEqual(compiled)
  })

  it('flags a missing entry scene', () => {
    const snapshot = createTemplate()
    snapshot.scenes = {}
    expect(codes(snapshot)).toContain('${name}.scene')
  })

  it('flags zero and multiple spawn points', () => {
    const none = createTemplate()
    none.scenes.main!.entities = []
    expect(codes(none)).toContain('${name}.spawnPoint')

    const extra = createTemplate()
    const clone = structuredClone(extra.scenes.main!.entities[0]!)
    clone.id = 'spawn-2'
    extra.scenes.main!.entities.push(clone)
    expect(codes(extra)).toContain('${name}.spawnPoint')
  })

  it('flags a goal outside the arena on either axis', () => {
    for (const axis of ['x', 'z'] as const) {
      const snapshot = createTemplate()
      const data = snapshot.resources.tuning!.data as { goal: { x: number; z: number } }
      data.goal[axis] = 99
      expect(codes(snapshot)).toContain('${name}.goal')
    }
  })

  it('leaves missing tuning to compile, which throws loudly', () => {
    const snapshot = createTemplate()
    snapshot.resources = {}
    snapshot.manifest.resources = []
    expect(projectDefinition.validate(snapshot).map((issue) => issue.code)).not.toContain('${name}.goal')
    expect(() => compileProject(snapshot)).toThrow(/tuning/i)
  })

  it('rejects compiling snapshots missing their scene, spawn, or transform', () => {
    const noScene = createTemplate()
    noScene.manifest.entrySceneId = 'other'
    expect(() => compileProject(noScene)).toThrow(/entry scene/i)

    const noSpawn = createTemplate()
    noSpawn.scenes.main!.entities = []
    expect(() => compileProject(noSpawn)).toThrow(/spawn point/i)

    const noTransform = createTemplate()
    const spawn = noTransform.scenes.main!.entities[0]!
    spawn.components = spawn.components.filter((component) => component.typeId !== 'core.transform')
    expect(() => compileProject(noTransform)).toThrow(/transform/i)
  })
})
`
}

export function contentTest(name: string, label: string): string {
  return `import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadProjectFiles, validateProject, type ProjectFileReader } from '@automata/project'
import { projectDefinition } from '../../src/project/definition'
import { loadProject } from '../../src/project/load'
import { createTemplate } from '../../src/project/template'

const root = resolve(import.meta.dirname, '../../public/project')
const reader: ProjectFileReader = { readText: (path) => readFile(resolve(root, path), 'utf8') }

const rewriting = (edit: (path: string, text: string) => string): ProjectFileReader => ({
  readText: async (path) => edit(path, await reader.readText(path))
})

describe('project content', () => {
  it('ships public files equal to the in-code template', async () => {
    const { snapshot } = await loadProjectFiles(reader)
    expect(validateProject(projectDefinition, snapshot)).toEqual([])
    expect(snapshot).toEqual(createTemplate())
  })

  it('loads and compiles through the runtime loader', async () => {
    const compiled = await loadProject(reader)
    expect(compiled.projectId).toBe('${name}')
    expect(compiled.tuning.timeLimitS).toBeGreaterThan(0)
  })

  it('rejects a project belonging to another game', async () => {
    const wrongGame = rewriting((path, text) =>
      path === 'automata.project.json' ? text.replace('"gameId": "${name}"', '"gameId": "other"') : text)
    await expect(loadProject(wrongGame)).rejects.toThrow(/Expected a ${label} project/)
  })

  it('rejects a project that fails schema or game validation', async () => {
    const negativeTime = rewriting((path, text) =>
      path.endsWith('tuning.resource.json') ? text.replace('"timeLimitS": 30', '"timeLimitS": -5') : text)
    await expect(loadProject(negativeTime)).rejects.toThrow(/Invalid ${label} project/)

    const goalOutside = rewriting((path, text) =>
      path.endsWith('tuning.resource.json') ? text.replace('"x": 8,', '"x": 99,') : text)
    await expect(loadProject(goalOutside)).rejects.toThrow(/${name}\\.goal/)
  })
})
`
}

export function editorTest(): string {
  return `import { describe, expect, it } from 'vitest'
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
`
}

export function e2eSmokeSpec(name: string, port: number): string {
  return `import { expect, test } from '@playwright/test'

test('${name} boots to a playable canvas without errors and within frame budget', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('http://127.0.0.1:${port}/')
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.locator('.hud')).toContainText(/reach the beacon/i)
  const p95 = await page.evaluate(async () => {
    const samples: number[] = []
    let last = performance.now()
    await new Promise<void>((resolve) => {
      const tick = (now: number): void => {
        samples.push(now - last)
        last = now
        if (samples.length >= 140) resolve()
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const settled = samples.slice(20).sort((a, b) => a - b)
    return settled[Math.floor(settled.length * 0.95)] ?? 0
  })
  expect(p95).toBeLessThan(50)
  expect(errors).toEqual([])
})
`
}
