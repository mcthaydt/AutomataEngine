import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEngine, hashJson, type CommandSpawner, type SpawnResult } from '@automata/build-session'
import { gameSpecSchema, minimalGameSpecDraft, type ToolResult } from '@automata/contracts'
import { composeGame } from '@automata/game-compose'
import type { HeadlessHost } from '../src/headlessHost'
import { createSessionHost } from '../src/sessionHost'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

function sliceDraft(gameId: string): Record<string, unknown> {
  const draft = minimalGameSpecDraft(gameId)
  draft.capabilities = [{ id: 'interaction-inventory', config: { requiredItems: 2, interactRadius: 1.5 }, requirements: [] }]
  draft.assets = [{ id: 'item-icon', kind: 'ui', description: 'Light-cell icon' }]
  return draft
}

const OK: SpawnResult = { code: 0, stdout: 'ok', stderr: '', timedOut: false }
const passingSpawner: CommandSpawner = { async run() { return OK } }
function headless(): HeadlessHost {
  const snapshot = { manifest: { id: 'probe', name: 'Probe', gameId: 'probe', formatVersion: 2, scenes: [], resources: [] }, scenes: {}, resources: {} }
  const host = {
    get snapshot() { return snapshot }, get commands() { return [] }, listTools: () => [],
    async executeTool(name: string): Promise<ToolResult> {
      return name === 'evaluate'
        ? { ok: true, content: { outcome: 'passed', metrics: { objectivesComplete: true } } }
        : { ok: false, isError: true, content: 'nope' }
    },
    async readResource() { return snapshot }
  }
  return { host, registration: {}, snapshot } as unknown as HeadlessHost
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'compose-flow-'))
  roots.push(root)
  await mkdir(join(root, 'games/probe/public/project'), { recursive: true })
  await mkdir(join(root, 'games/probe/src'), { recursive: true })
  await writeFile(join(root, 'games/probe/package.json'), JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' }, automata: { devPort: 5199 } }))
  const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7, spawner: passingSpawner, openHeadless: async () => headless() })
  return { root, host }
}

describe('Phase 3 exit criterion — spec → compose → evaluate → slice checkpoint', () => {
  it('runs the full flow, approves on green gates, and reopens on recompile', async () => {
    const { host } = await setup()
    await host.executeTool('compileGameSpec', { gameId: 'probe', draft: sliceDraft('probe'), prompt: 'slice', translations: [] })
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })
    expect(await host.executeTool('composeGame', { gameId: 'probe' })).toMatchObject({ ok: true, content: { cached: false, itemCount: 2 } })
    for (const tool of ['runBuild', 'runTests', 'runBrowserEval']) expect((await host.executeTool(tool, { gameId: 'probe' })).ok).toBe(true)
    const early = await host.executeTool('renderSliceReport', { gameId: 'probe' })
    expect((early.content as { gates: Array<{ status: string }> }).gates.some((gate) => gate.status === 'missing')).toBe(true)
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'approve', reason: 'ship' })).toMatchObject({ ok: false })
    await host.executeTool('openProject', { gameId: 'probe' })
    await host.executeTool('evaluate', { maxSteps: 4000 })
    const report = await host.executeTool('renderSliceReport', { gameId: 'probe' })
    expect((report.content as { gates: Array<{ status: string }> }).gates.every((gate) => gate.status === 'passed')).toBe(true)
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'approve', reason: 'green' })).toMatchObject({ ok: true, content: { decision: 'approve' } })
    const draft2 = sliceDraft('probe'); (draft2.identity as Record<string, unknown>).logline = 'Changed.'
    await host.executeTool('compileGameSpec', { gameId: 'probe', draft: draft2, prompt: 'slice', translations: [], changeReason: 'tweak' })
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'reject', reason: 'stale' })).toMatchObject({ ok: false })
    await host.dispose()
  })

  it('compose:game replays deterministically from the recorded seed', async () => {
    const { root, host } = await setup()
    await host.executeTool('compileGameSpec', { gameId: 'probe', draft: sliceDraft('probe'), prompt: 'slice', translations: [] })
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })
    await host.executeTool('composeGame', { gameId: 'probe' })
    await host.dispose()
    const { engine } = await createSessionEngine({ sessionsRoot: join(root, '.automata/sessions'), gameId: 'probe', projectDir: join(root, 'games/probe/public/project'), engineVersion: 'test', lock: false })
    const step = engine.session.steps.find((value) => value.kind === 'compose:game')!
    const spec = gameSpecSchema.parse(JSON.parse(await readFile(join(root, 'games/probe/gamespec.json'), 'utf8')))
    const specHash = hashJson(spec)
    const replay = await engine.replayStep(step.id, async (_rng, seed) => {
      const result = composeGame({ spec, seed, specHash })
      if (!result.ok) throw new Error('replay failed')
      return { composition: result.composition, assetManifest: result.assetManifest, files: result.files, summary: result.summary }
    })
    expect(replay.ok).toBe(true)
    await engine.dispose()
  })
})
