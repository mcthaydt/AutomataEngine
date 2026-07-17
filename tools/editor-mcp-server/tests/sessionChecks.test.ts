import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolResult } from '@automata/contracts'
import type { CommandSpawner, SpawnResult } from '@automata/build-session'
import { createSessionHost } from '../src/sessionHost'
import type { HeadlessHost } from '../src/headlessHost'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
const OK: SpawnResult = { code: 0, stdout: 'ok', stderr: '', timedOut: false }
const FAIL: SpawnResult = { code: 1, stdout: '', stderr: 'broken', timedOut: false }
async function repo() { const root = await mkdtemp(join(tmpdir(), 'session-checks-')); roots.push(root); await mkdir(join(root, 'games/probe/src'), { recursive: true }); await mkdir(join(root, 'games/probe/public/project'), { recursive: true }); await writeFile(join(root, 'games/probe/package.json'), JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' } })); await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 1'); return root }
function headless(): HeadlessHost { const snapshot = { manifest: { id: 'probe', name: 'Probe', gameId: 'probe', formatVersion: 2, scenes: [], resources: [] }, scenes: {}, resources: {} }; const host = { get snapshot() { return snapshot }, get commands() { return [] }, listTools: () => [], async executeTool(name: string): Promise<ToolResult> { return name === 'evaluate' ? { ok: true, content: { outcome: 'passed' } } : { ok: false, isError: true, content: 'nope' } }, async readResource() { return snapshot } }; return { host, registration: {}, snapshot } as unknown as HeadlessHost }
describe('session check tools', () => {
  it('runs checks by explicit gameId without first opening a project and caches a repeated run', async () => {
    const root = await repo(); const script = [OK, OK, OK, OK]; const spawner: CommandSpawner = { async run() { const next = script.shift(); if (!next) throw new Error('unexpected'); return next } }
    const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), spawner, openHeadless: async () => headless(), lock: false })
    expect(await host.executeTool('runBuild', { gameId: 'probe' })).toMatchObject({ ok: true, content: { passed: true, cached: false } })
    expect(await host.executeTool('runBuild', { gameId: 'probe' })).toMatchObject({ ok: true, content: { cached: true } })
    await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 2')
    expect(await host.executeTool('runBuild', { gameId: 'probe' })).toMatchObject({ ok: true, content: { passed: true, cached: false } })
    expect(await host.executeTool('createGame', { name: 'probe' })).toMatchObject({
      ok: true,
      content: { session: { staleSteps: 1 } }
    })
    await host.dispose()
  })

  it('surfaces failures, changes, and evaluation through the durable session', async () => {
    const root = await repo()
    const script = [FAIL, OK]
    const spawner: CommandSpawner = { async run() { const next = script.shift(); if (!next) throw new Error('unexpected'); return next } }
    const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), spawner, openHeadless: async () => headless(), lock: false })

    await host.executeTool('openProject', { gameId: 'probe' })
    expect(await host.executeTool('runTests', { scope: 'sim' })).toMatchObject({ ok: true, content: { passed: false } })
    await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 2')
    expect(await host.executeTool('runTests', {})).toMatchObject({ ok: true, content: { passed: true } })
    expect(await host.executeTool('changedFiles', {})).toMatchObject({ ok: true, content: { changed: ['game/src/sim.ts'] } })
    expect(await host.executeTool('evaluate', {})).toMatchObject({ ok: true, content: { outcome: 'passed', cached: false } })
    expect(await host.executeTool('evaluate', {})).toMatchObject({ ok: true, content: { cached: true } })
    const session = JSON.parse(await readFile(join(root, '.automata/sessions/probe/session.json'), 'utf8')) as { steps: Array<{ kind: string; result: unknown }> }
    expect(session.steps.find((step) => step.kind === 'check:evaluate')?.result).toMatchObject({ contentHash: expect.any(String) })
    await host.dispose()
  })

  it('detects asset-only changes across project opens', async () => {
    const root = await repo(); await mkdir(join(root, 'games/probe/public/assets'), { recursive: true }); await writeFile(join(root, 'games/probe/public/assets/item.svg'), '<svg />')
    const spawner: CommandSpawner = { async run() { return OK } }
    const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), spawner, openHeadless: async () => headless(), lock: false })
    expect(await host.executeTool('openProject', { gameId: 'probe' })).toMatchObject({ ok: true, content: { outOfBandChanges: false } })
    expect(await host.executeTool('runBuild', { gameId: 'probe' })).toMatchObject({ ok: true, content: { passed: true } })
    await writeFile(join(root, 'games/probe/public/assets/item.svg'), '<svg><path /></svg>')
    expect(await host.executeTool('openProject', { gameId: 'probe' })).toMatchObject({
      ok: true,
      content: { outOfBandChanges: true, session: { staleSteps: 1 } }
    })
    expect(await host.executeTool('changedFiles', {})).toMatchObject({ ok: true, content: { changed: ['game/public/assets/item.svg'] } })
    await host.dispose()
  })
})
