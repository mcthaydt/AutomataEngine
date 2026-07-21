import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { gameSpecSchema, minimalGameSpecDraft, type ToolResult } from '@automata/contracts'
import { createSessionHost } from '../src/sessionHost'
import type { HeadlessHost } from '../src/headlessHost'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'session-host-')); roots.push(root)
  await mkdir(join(root, 'games/probe/src'), { recursive: true }); await mkdir(join(root, 'games/probe/public/project'), { recursive: true })
  await writeFile(join(root, 'games/probe/package.json'), JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' } }))
  await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 1')
  return root
}
function stubHeadless(): HeadlessHost {
  const snapshot = { manifest: { id: 'probe', name: 'Probe', gameId: 'probe', formatVersion: 2, scenes: [{ id: 'main', path: 'scenes/main.json' }], resources: [] }, scenes: { main: { id: 'main', name: 'Main', entities: [{ id: 'e1', name: 'Player', enabled: true, components: [] }] } }, resources: {} }
  const host = { get snapshot() { return snapshot }, get commands() { return [] }, listTools: () => [{ name: 'setProperty', description: 'stub', schema: {} }], async executeTool(name: string, args: unknown): Promise<ToolResult> { if (name === 'setProperty') { snapshot.scenes.main.entities[0]!.name = (args as { value: string }).value; return { ok: true, content: { applied: name, changed: true } } } if (name === 'validate') return { ok: true, content: [] }; return { ok: false, isError: true, content: `stub has no ${name}` } }, async readResource() { return snapshot } }
  return { host, registration: {}, snapshot } as unknown as HeadlessHost
}
describe('sessionHost', () => {
  it('opens projects and makes durable project tools available only after openProject', async () => {
    const root = await makeRepo(); const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), openHeadless: async () => stubHeadless(), lock: false })
    expect(host.listTools().map((tool) => tool.name)).toContain('openProject'); expect(host.listTools().map((tool) => tool.name)).not.toContain('setProperty')
    expect((await host.executeTool('openProject', { gameId: 'probe' })).ok).toBe(true)
    expect(host.listTools().map((tool) => tool.name)).toContain('setProperty')
    const written = await host.executeTool('setProperty', { value: 'Hero', clientStepId: 'rename' })
    expect(written.content).toMatchObject({ stepId: expect.any(String) })
    expect((await host.executeTool('setProperty', { value: 'Hero', clientStepId: 'rename' })).content).toMatchObject({ deduped: true })
    await host.dispose()
  })

  it('reports lifecycle contract violations and records validation findings', async () => {
    const root = await makeRepo()
    const host = createSessionHost({
      repoRoot: root,
      sessionsRoot: join(root, '.automata/sessions'),
      openHeadless: async () => stubHeadless(),
      lock: false
    })

    expect(await host.executeTool('getSession', {})).toMatchObject({ ok: false, isError: true })
    expect(await host.executeTool('setResumePoint', { nextAction: 'x' })).toMatchObject({ ok: false })
    expect(await host.executeTool('changedFiles', {})).toMatchObject({ ok: false })
    expect(await host.executeTool('openProject', { gameId: 'unknown' })).toMatchObject({ ok: false })
    await expect(host.readResource('editor://project')).rejects.toThrow(/no project open/i)

    await host.executeTool('openProject', { gameId: 'probe' })
    expect(await host.executeTool('validate', {})).toMatchObject({ ok: true })
    expect(await host.executeTool('getHierarchy', {})).toMatchObject({ ok: false })
    await host.dispose()
  })

  it('creates a new game once and returns its durable session on retry', async () => {
    const root = await makeRepo()
    const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 })

    const created = await host.executeTool('createGame', { name: 'beacon-run' })
    expect(created).toMatchObject({ ok: true, content: { gameDir: 'games/beacon-run', alreadyExisted: false } })
    expect(await host.executeTool('createGame', { name: 'beacon-run' })).toMatchObject({
      ok: true,
      content: { alreadyExisted: true }
    })
    expect(await host.executeTool('listGames', {})).toMatchObject({ ok: true, content: { games: expect.arrayContaining(['beacon-run', 'probe']) } })
    await host.dispose()
  })

  it('dispatches regenerateAsset through the durable asset runner without opening a project', async () => {
    const root = await makeRepo()
    const host = createSessionHost({
      repoRoot: root,
      sessionsRoot: join(root, '.automata/sessions'),
      lock: false
    })

    const result = await host.executeTool('regenerateAsset', {
      gameId: 'probe',
      assetId: 'missing',
      seed: 7
    })

    expect(result).toMatchObject({ ok: false, isError: true })
    expect(result.content).toMatch(/gamespec\.json/)
    await host.dispose()
  })

  it('preserves coded provider errors in MCP tool results', async () => {
    const root = await makeRepo()
    const spec = gameSpecSchema.parse({
      specVersion: 1,
      provenance: {
        prompt: 'probe prompt',
        translations: [],
        history: [{ version: 1, reason: 'initial draft' }]
      },
      ...minimalGameSpecDraft('probe'),
      assets: [{ id: 'probe-icon', kind: 'ui', description: 'Probe icon.' }]
    })
    await writeFile(join(root, 'games/probe/gamespec.json'), JSON.stringify(spec))
    const host = createSessionHost({
      repoRoot: root,
      sessionsRoot: join(root, '.automata/sessions'),
      lock: false
    })

    const result = await host.executeTool('generateAssets', {
      gameId: 'probe', seed: 7, provider: 'missing-provider'
    })

    expect(result).toMatchObject({
      ok: false,
      isError: true,
      content: {
        code: 'asset-provider-unknown',
        message: expect.stringMatching(/missing-provider/)
      }
    })
    await host.dispose()
  })
})
