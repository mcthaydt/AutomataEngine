import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { minimalGameSpecDraft } from '@automata/contracts'
import { createSessionHost } from '../src/sessionHost'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

function sliceDraft(gameId: string): Record<string, unknown> {
  const draft = minimalGameSpecDraft(gameId)
  draft.capabilities = [{ id: 'interaction-inventory', config: { requiredItems: 2, interactRadius: 1.5 }, requirements: [] }]
  draft.assets = [{ id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD' }]
  return draft
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'compose-'))
  roots.push(root)
  await mkdir(join(root, 'games/probe/public/project'), { recursive: true })
  await writeFile(join(root, 'games/probe/package.json'), JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' }, automata: { devPort: 5199 } }))
  const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 })
  expect((await host.executeTool('compileGameSpec', { gameId: 'probe', draft: sliceDraft('probe'), prompt: 'slice', translations: [] })).ok).toBe(true)
  return { root, host }
}

describe('composeGame tool', () => {
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

  it('surfaces missing prerequisites and persists a typed unsupported-capability finding', async () => {
    const { host } = await setup()
    expect(await host.executeTool('renderSliceReport', { gameId: 'ghost' })).toMatchObject({
      ok: false,
      content: expect.stringContaining('no gamespec.json')
    })
    expect(await host.executeTool('renderSliceReport', { gameId: 'probe' })).toMatchObject({
      ok: false,
      content: expect.stringContaining('no compose:game step')
    })

    const unsupported = sliceDraft('probe')
    unsupported.capabilities = [{ id: 'save-load', config: {}, requirements: [] }]
    expect(await host.executeTool('compileGameSpec', {
      gameId: 'probe', draft: unsupported, prompt: 'unsupported slice', translations: []
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
  it('renders with missing gates, refuses approval, records rejection, and requires a report', async () => {
    const { host } = await setup()
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'go' })
    await host.executeTool('composeGame', { gameId: 'probe' })
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'reject', reason: 'no report' })).toMatchObject({ ok: false })
    const report = await host.executeTool('renderSliceReport', { gameId: 'probe' })
    expect(report).toMatchObject({ ok: true, content: { artifact: 'artifacts/slice-report.md' } })
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'approve', reason: 'ship' })).toMatchObject({ ok: false, content: { code: 'slice-gates-not-passed' } })
    expect(await host.executeTool('recordSliceDecision', { gameId: 'probe', decision: 'reject', reason: 'red' })).toMatchObject({ ok: true, content: { recorded: true, decision: 'reject' } })
    await host.dispose()
  })
})
