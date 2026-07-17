import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEngine, hashJson } from '@automata/build-session'
import { nextSpecVersion, normalizeGameSpec, validateGameSpec } from '@automata/game-spec'
import { createSessionHost } from '../src/sessionHost'
import { GAME_SPEC_PROMPTS } from './fixtures/gameSpecPrompts'
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
async function createGames(root: string) { for (const item of GAME_SPEC_PROMPTS) { await mkdir(join(root, `games/${item.gameId}/public/project`), { recursive: true }); await writeFile(join(root, `games/${item.gameId}/package.json`), JSON.stringify({ name: item.gameId, exports: { './project': './src/project/index.ts' } })) } }
describe('Phase 2 exit criterion', () => {
  it('uses distinct recorded drafts rather than a shared minimal shape', () => {
    const loglines = new Set(GAME_SPEC_PROMPTS.map((item) => (item.draft.identity as { logline: string }).logline))
    const capabilitySelections = new Set(GAME_SPEC_PROMPTS.map((item) => JSON.stringify(item.draft.capabilities)))
    expect(loglines).toHaveLength(10)
    expect(capabilitySelections.size).toBeGreaterThan(3)
  })

  it('ten differently worded prompts produce valid, bounded, reviewable specs', async () => { const root = await mkdtemp(join(tmpdir(), 'gs-exit-')); roots.push(root); await createGames(root); expect(GAME_SPEC_PROMPTS).toHaveLength(10); const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 }); for (const item of GAME_SPEC_PROMPTS) { expect(await host.executeTool('compileGameSpec', { gameId: item.gameId, draft: item.draft, prompt: item.prompt, translations: [] })).toMatchObject({ ok: true, content: { specVersion: 1, checkpoint: 'pending' } }); expect(await host.executeTool('renderDesignBrief', { gameId: item.gameId })).toMatchObject({ ok: true }); expect(await host.executeTool('recordDesignDecision', { gameId: item.gameId, decision: 'approve', reason: 'exit criterion' })).toMatchObject({ ok: true }) }; await host.dispose() })
  it('spec:compile replays deterministically from recorded inputs', async () => { const root = await mkdtemp(join(tmpdir(), 'gs-replay-')); roots.push(root); const item = GAME_SPEC_PROMPTS[0]!; await mkdir(join(root, `games/${item.gameId}/public/project`), { recursive: true }); await writeFile(join(root, `games/${item.gameId}/package.json`), JSON.stringify({ name: item.gameId, exports: { './project': './src/project/index.ts' } })); const host = createSessionHost({ repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), lock: false, seedSource: () => 7 }); await host.executeTool('compileGameSpec', { gameId: item.gameId, draft: item.draft, prompt: item.prompt, translations: [] }); await host.dispose(); const { engine } = await createSessionEngine({ sessionsRoot: join(root, '.automata/sessions'), gameId: item.gameId, projectDir: join(root, `games/${item.gameId}/public/project`), engineVersion: 'test', lock: false }); const step = engine.session.steps.find((value) => value.kind === 'spec:compile')!; const validated = validateGameSpec(item.draft, { gameId: item.gameId }); if (!validated.ok) throw new Error('fixture must be valid'); const stamped = nextSpecVersion({ current: null, currentApproved: false, draft: validated.draft, prompt: item.prompt, translations: [] }); if (!stamped.ok) throw new Error('fixture must stamp'); const spec = normalizeGameSpec(stamped.spec); expect((await engine.replayStep(step.id, async () => spec)).actual).toBe(hashJson(spec)); await engine.dispose() })
})
