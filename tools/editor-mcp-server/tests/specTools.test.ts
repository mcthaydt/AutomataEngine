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
})
