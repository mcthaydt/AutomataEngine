import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { minimalGameSpecDraft } from '@automata/contracts'
import { createSessionHost } from '../src/sessionHost'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
async function makeRepo() { const root = await mkdtemp(join(tmpdir(), 'spec-tools-')); roots.push(root); await mkdir(join(root, 'games/probe/public/project'), { recursive: true }); await writeFile(join(root, 'games/probe/package.json'), JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' } })); return root }
const args = () => ({ gameId: 'probe', draft: minimalGameSpecDraft(), prompt: 'make a tiny hub game', translations: [] })
describe('compileGameSpec / getGameSpec', () => {
  it('lists, validates, persists, caches, and reads spec tools without an open project', async () => { const root = await makeRepo(); const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 }); for (const name of ['compileGameSpec', 'getGameSpec', 'renderDesignBrief', 'recordDesignDecision']) expect(host.listTools().map((tool) => tool.name)).toContain(name); const first = await host.executeTool('compileGameSpec', args()); expect(first).toMatchObject({ ok: true, content: { specVersion: 1, cached: false, checkpoint: 'pending' } }); expect(await host.executeTool('compileGameSpec', args())).toMatchObject({ ok: true, content: { cached: true } }); expect(await host.executeTool('getGameSpec', { gameId: 'probe' })).toMatchObject({ ok: true, content: { specVersion: 1, checkpoint: 'pending' } }); await host.dispose() })

  it('records typed findings for invalid drafts without writing and rejects unknown games', async () => {
    const root = await makeRepo()
    const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 })
    const invalid = minimalGameSpecDraft()
    ;(invalid.budgets as Record<string, unknown>).targetMinutes = 999
    expect(await host.executeTool('compileGameSpec', { ...args(), draft: invalid })).toMatchObject({ ok: false, isError: true })
    expect(await host.executeTool('getGameSpec', { gameId: 'probe' })).toMatchObject({ ok: false })
    expect(await host.executeTool('compileGameSpec', { ...args(), gameId: 'ghost' })).toMatchObject({ ok: false, isError: true })
    await host.dispose()
  })
})

describe('design checkpoint lifecycle', () => {
  it('briefs, approves, freezes, bumps with a reason, and reopens approval', async () => {
    const root = await makeRepo(); const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 })
    await host.executeTool('compileGameSpec', args())
    expect(await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'looks right' })).toMatchObject({ ok: false })
    expect(await host.executeTool('renderDesignBrief', { gameId: 'probe' })).toMatchObject({ ok: true, content: { cached: false, artifact: 'artifacts/design-brief.md' } })
    expect(await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'looks right' })).toMatchObject({ ok: true, content: { recorded: true, specVersion: 1 } })
    const edited = minimalGameSpecDraft(); (edited.identity as Record<string, unknown>).title = 'Probe II'
    expect(JSON.stringify((await host.executeTool('compileGameSpec', { ...args(), draft: edited })).content)).toContain('spec-approved-immutable')
    expect(await host.executeTool('compileGameSpec', { ...args(), draft: edited, changeReason: 'retitle for tone' })).toMatchObject({ ok: true, content: { specVersion: 2, checkpoint: 'pending' } })
    expect(await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'approve', reason: 'v2 fine' })).toMatchObject({ ok: false })
    await host.dispose()
  })

  it('records rejection and keeps the current version editable', async () => {
    const root = await makeRepo()
    const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 })
    await host.executeTool('compileGameSpec', args())
    await host.executeTool('renderDesignBrief', { gameId: 'probe' })
    expect(await host.executeTool('recordDesignDecision', { gameId: 'probe', decision: 'reject', reason: 'wrong tone' }))
      .toMatchObject({ ok: true, content: { decision: 'reject' } })
    expect(await host.executeTool('getGameSpec', { gameId: 'probe' }))
      .toMatchObject({ ok: true, content: { checkpoint: 'rejected' } })
    const revised = minimalGameSpecDraft()
    ;(revised.direction as Record<string, unknown>).dialogueTone = 'noir'
    expect(await host.executeTool('compileGameSpec', { ...args(), draft: revised }))
      .toMatchObject({ ok: true, content: { specVersion: 1, checkpoint: 'pending' } })
    await host.dispose()
  })
})
