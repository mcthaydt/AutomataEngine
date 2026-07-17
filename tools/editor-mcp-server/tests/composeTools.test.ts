import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEngine, hashJson } from '@automata/build-session'
import { minimalGameSpecDraft } from '@automata/contracts'
import { sliceCheckpointStatus } from '../src/composeTools'
import { createSessionHost } from '../src/sessionHost'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

function sliceDraft(gameId: string): Record<string, unknown> {
  const draft = minimalGameSpecDraft(gameId)
  draft.capabilities = [{ id: 'interaction-inventory', config: { requiredItems: 2, interactRadius: 1.5 }, requirements: [] }]
  draft.assets = [{ id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD' }]
  return draft
}

async function setup(writeFiles?: () => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'compose-'))
  roots.push(root)
  await mkdir(join(root, 'games/probe/public/project'), { recursive: true })
  await writeFile(join(root, 'games/probe/package.json'), JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' }, automata: { devPort: 5199 } }))
  const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7, ...(writeFiles ? { writeFiles } : {}) })
  expect((await host.executeTool('compileGameSpec', { gameId: 'probe', draft: sliceDraft('probe'), prompt: 'slice', translations: [] })).ok).toBe(true)
  return { root, host }
}

describe('composeGame tool', () => {
  it('write failure records no compose step and persists a typed finding', async () => {
    const { root, host } = await setup(async () => { throw new Error('disk full') })
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })
    expect(await host.executeTool('composeGame', { gameId: 'probe' })).toMatchObject({ ok: false, content: { code: 'compose-failed' } })
    expect(await host.executeTool('createGame', { name: 'probe' })).toMatchObject({
      ok: true,
      content: { session: { openFindings: [expect.objectContaining({ source: 'compose', code: 'compose-failed' })] } }
    })
    const session = JSON.parse(await readFile(join(root, '.automata/sessions/probe/session.json'), 'utf8')) as { steps: Array<{ kind: string; status: string }> }
    expect(session.steps.some((step) => step.kind === 'compose:game' && step.status === 'completed')).toBe(false)
    await host.dispose()
  })

  it('refuses before design approval, then writes files and caches identical reruns after approval', async () => {
    const { root, host } = await setup()
    expect(await host.executeTool('composeGame', { gameId: 'probe' })).toMatchObject({ ok: false, content: { code: 'compose-requires-approval' } })
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })
    expect(await host.executeTool('composeGame', { gameId: 'probe' })).toMatchObject({ ok: true, content: { cached: false, itemCount: 2 } })
    expect(JSON.parse(await readFile(join(root, 'games/probe/public/project/composition.json'), 'utf8'))).toMatchObject({ source: { seed: 7 } })
    await readFile(join(root, 'games/probe/public/assets/item-icon.svg'), 'utf8')
    expect(await host.executeTool('composeGame', { gameId: 'probe' })).toMatchObject({ ok: true, content: { cached: true } })
    await host.dispose()
  })

  it('does not reuse a legacy compose step after composed output semantics change', async () => {
    const { root, host } = await setup()
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })
    await host.executeTool('composeGame', { gameId: 'probe' })
    await host.dispose()

    const sessionPath = join(root, '.automata/sessions/probe/session.json')
    const session = JSON.parse(await readFile(sessionPath, 'utf8')) as { steps: Array<{ kind: string; inputHash: string }> }
    const spec = JSON.parse(await readFile(join(root, 'games/probe/gamespec.json'), 'utf8'))
    session.steps.find((step) => step.kind === 'compose:game')!.inputHash = hashJson({ specHash: hashJson(spec) })
    await writeFile(sessionPath, JSON.stringify(session))

    const reopened = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 })
    expect(await reopened.executeTool('composeGame', { gameId: 'probe' }))
      .toMatchObject({ ok: true, content: { cached: false } })
    await reopened.dispose()
  })

  it('surfaces missing prerequisites and persists a typed unsupported-capability finding', async () => {
    const { host } = await setup()
    expect(await host.executeTool('renderSliceReport', { gameId: 'ghost' })).toMatchObject({
      ok: false,
      content: expect.stringContaining('no gamespec.json')
    })
    expect(await host.executeTool('renderSliceReport', { gameId: 'probe' })).toMatchObject({
      ok: false,
      content: expect.stringContaining('approved design checkpoint')
    })
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'exercise missing composition' })
    expect(await host.executeTool('renderSliceReport', { gameId: 'probe' })).toMatchObject({
      ok: false,
      content: expect.stringContaining('no compose:game step')
    })

    const unsupported = sliceDraft('probe')
    unsupported.capabilities = [{ id: 'save-load', config: {}, requirements: [] }]
    expect(await host.executeTool('compileGameSpec', {
      gameId: 'probe', draft: unsupported, prompt: 'unsupported slice', translations: [], changeReason: 'exercise unsupported capability'
    })).toMatchObject({ ok: true })
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'exercise compose finding' })
    expect(await host.executeTool('composeGame', { gameId: 'probe' })).toMatchObject({
      ok: false,
      content: { code: 'compose-unsupported-capability' }
    })
    expect(await host.executeTool('createGame', { name: 'probe' })).toMatchObject({
      ok: true,
      content: { session: { openFindings: [expect.objectContaining({ source: 'compose', code: 'compose-unsupported-capability' })] } }
    })
    await host.dispose()
  })
})

describe('slice checkpoint tools', () => {
  it('returns pending when the content hash differs from the recorded checkpoint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slice-status-')); roots.push(root)
    const { engine } = await createSessionEngine({ sessionsRoot: root, gameId: 'probe', projectDir: 'project', engineVersion: 'test', lock: false })
    await engine.journalStep('checkpoint:slice', { inputHash: 'input', result: { decision: 'approve', specHash: 'spec', compositionHash: 'composition', contentHash: 'old-content' } })
    expect(sliceCheckpointStatus(engine, { specHash: 'spec', compositionHash: 'composition', contentHash: 'new-content' })).toBe('pending')
    await engine.dispose()
  })

  it('renders with missing gates, refuses approval, records rejection, and requires a report', async () => {
    const { host } = await setup()
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })
    await host.executeTool('composeGame', { gameId: 'probe' })
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'reject', reason: 'no report' })).toMatchObject({ ok: false })
    const report = await host.executeTool('renderSliceReport', { gameId: 'probe' })
    expect(report).toMatchObject({ ok: true, content: { artifact: 'artifacts/slice-report.md' } })
    expect((report.content as { gates: Array<{ kind: string; status: string }> }).gates)
      .toContainEqual({ kind: 'asset', status: 'missing' })
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'approve', reason: 'ship' })).toMatchObject({ ok: false, content: { code: 'slice-gates-not-passed' } })
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'reject', reason: 'red' })).toMatchObject({ ok: true, content: { recorded: true, decision: 'reject' } })
    await host.dispose()
  })
})
