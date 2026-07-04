import { describe, expect, it } from 'vitest'
import { defineGameProject, z } from '@automata/project'
import { registerEditorProject } from '../../src/project/registration'
import { createProjectToolHost } from '../../src/project/toolHost'
import {
  evaluationCalls,
  fakeEditorRegistration,
  fakeSnapshot
} from '../fixtures/fakeProject'

describe('listTools schema decoration', () => {
  const registration = registerEditorProject({
    project: defineGameProject({
      gameId: 'deco', label: 'Deco',
      createTemplate: () => ({
        manifest: {
          formatVersion: 1, id: 'deco', name: 'Deco', gameId: 'deco', entrySceneId: 'main',
          scenes: [{ id: 'main', path: 'scenes/main.scene.json' }], resources: []
        },
        scenes: { main: { formatVersion: 1, id: 'main', name: 'Main', entities: [] } },
        resources: {}
      }),
      components: [{
        typeId: 'deco.stats', label: 'Stats',
        schema: z.strictObject({ speed: z.number().min(0).meta({ label: 'Speed' }) }),
        defaultData: { speed: 1 }, cardinality: { min: 0, max: 1 }
      }],
      resources: [], validate: () => [], compile: () => ({})
    }),
    prefabs: []
  })

  it('appends per-type JSON schemas to data-carrying tool descriptions', () => {
    const host = createProjectToolHost({ registration, initialSnapshot: registration.createTemplate() })
    const tools = new Map(host.listTools().map((tool) => [tool.name, tool.description]))
    expect(tools.get('addComponent')).toContain('deco.stats')
    expect(tools.get('addComponent')).toContain('"minimum":0')
    expect(tools.get('addComponent')).toContain('core.transform')
    expect(tools.get('setProperty')).toContain('deco.stats')
    expect(tools.get('validate')).not.toContain('deco.stats')
  })
})

describe('project ToolHost', () => {
  it('applies semantic writes only to the sandbox and records exact commands', async () => {
    const seed = fakeSnapshot()
    const host = createProjectToolHost({
      registration: registerEditorProject(fakeEditorRegistration),
      initialSnapshot: seed
    })
    const result = await host.executeTool('setProperty', {
      target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: 8
    })

    expect(result).toMatchObject({ ok: true, content: { applied: 'setProperty', changed: true } })
    expect((seed.resources.tuning!.data as { speed: number }).speed).toBe(4)
    expect((host.snapshot.resources.tuning!.data as { speed: number }).speed).toBe(8)
    expect(host.commands).toEqual([{
      type: 'setProperty',
      target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: 8
    }])

    await host.executeTool('setProperty', {
      target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: 8
    })
    expect(host.commands).toHaveLength(1)
  })

  it('leaves the sandbox and command log unchanged after expected command failures', async () => {
    const host = createProjectToolHost({
      registration: registerEditorProject(fakeEditorRegistration),
      initialSnapshot: fakeSnapshot()
    })
    const before = host.snapshot

    const result = await host.executeTool('setProperty', {
      target: { kind: 'resource', resourceId: 'tuning' }, pointer: '/speed', value: -1
    })

    expect(result).toMatchObject({ ok: false, isError: true })
    expect(host.snapshot).toBe(before)
    expect(host.commands).toEqual([])
  })

  it('returns canonical project reads, resources, validation, and baseline data', async () => {
    const baseline = { score: 0.25 }
    const host = createProjectToolHost({
      registration: registerEditorProject(fakeEditorRegistration),
      initialSnapshot: fakeSnapshot(),
      baseline
    })

    expect((await host.executeTool('getProject', {})).content).toEqual(host.snapshot)
    expect((await host.executeTool('getHierarchy', {})).content).toEqual({
      scenes: [{
        id: 'main', name: 'Main',
        entities: [expect.objectContaining({ id: 'box', name: 'Box', componentTypeIds: ['core.transform', 'core.primitive', 'core.surface'] })]
      }]
    })
    expect((await host.executeTool('getResources', {})).content).toEqual([host.snapshot.resources.tuning])
    expect((await host.executeTool('validate', {})).content).toEqual([])
    expect(await host.readResource('editor://project')).toEqual(host.snapshot)
    expect(await host.readResource('editor://baseline')).toEqual(baseline)
    expect(host.listTools().map((tool) => tool.name)).toContain('addEntity')
  })

  it('validates then delegates normalized evaluation', async () => {
    evaluationCalls.length = 0
    const host = createProjectToolHost({
      registration: registerEditorProject(fakeEditorRegistration),
      initialSnapshot: fakeSnapshot()
    })

    const result = await host.executeTool('evaluate', { maxSteps: 90 })

    expect(result).toMatchObject({ ok: true, content: { outcome: 'passed', score: 1 } })
    expect(evaluationCalls).toEqual([{ maxSteps: 90 }])
  })

  it('reports invalid projects and missing evaluation adapters as error results', async () => {
    const invalid = fakeSnapshot()
    invalid.scenes.main!.entities[0]!.components.push({ id: 'bad', typeId: 'unknown', data: {} })
    const invalidHost = createProjectToolHost({
      registration: registerEditorProject(fakeEditorRegistration),
      initialSnapshot: invalid
    })
    expect(await invalidHost.executeTool('evaluate', { maxSteps: 10 })).toMatchObject({ ok: false, isError: true })

    const withoutEvaluation = registerEditorProject({ ...fakeEditorRegistration, evaluation: undefined })
    const host = createProjectToolHost({ registration: withoutEvaluation, initialSnapshot: fakeSnapshot() })
    expect(await host.executeTool('evaluate', { maxSteps: 10 })).toMatchObject({
      ok: false, isError: true, content: expect.stringMatching(/evaluation/i)
    })
  })

  it('covers malformed calls, sparse reads, every resource, and evaluation exceptions', async () => {
    const sparse = fakeSnapshot()
    sparse.manifest.scenes.push({ id: 'missing', path: 'scenes/missing.scene.json' })
    sparse.manifest.resources.push({
      id: 'missing-resource', typeId: 'fake.tuning', path: 'resources/missing.json'
    })
    sparse.scenes.main!.entities[0]!.parentId = 'parent'
    const registration = registerEditorProject({
      ...fakeEditorRegistration,
      evaluation: { evaluate: async () => { throw 'evaluation exploded' } }
    })
    const host = createProjectToolHost({ registration, initialSnapshot: sparse })

    expect(await host.executeTool('removeArrayItem', {
      target: { kind: 'manifest' }, pointer: 'bad', index: -1
    })).toMatchObject({ ok: false, isError: true })
    expect((await host.executeTool('getHierarchy', {})).content).toEqual({
      scenes: [
        expect.objectContaining({
          id: 'main',
          entities: [expect.objectContaining({ parentId: 'parent' })]
        }),
        { id: 'missing', name: 'missing', entities: [] }
      ]
    })
    expect((await host.executeTool('getResources', {})).content).toHaveLength(1)
    expect(await host.readResource('editor://hierarchy')).toEqual(
      (await host.executeTool('getHierarchy', {})).content
    )
    expect(await host.readResource('editor://resources')).toEqual([sparse.resources.tuning])
    expect(await host.readResource('editor://validation')).toEqual(
      (await host.executeTool('validate', {})).content
    )
    expect(await host.readResource('editor://baseline')).toBeNull()
    expect(await host.readResource('editor://unknown' as never)).toBeNull()

    const validHost = createProjectToolHost({
      registration,
      initialSnapshot: fakeSnapshot()
    })
    expect(await validHost.executeTool('evaluate', { maxSteps: 10 })).toEqual({
      ok: false, isError: true, content: 'evaluation exploded'
    })
  })
})
