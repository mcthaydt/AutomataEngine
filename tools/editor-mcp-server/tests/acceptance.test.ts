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
const PASS: SpawnResult = { code: 0, stdout: 'ok', stderr: '', timedOut: false }
async function makeRepo() { const root = await mkdtemp(join(tmpdir(), 'acceptance-')); roots.push(root); const dir = join(root, 'games/probe/public/project'); await mkdir(join(root, 'games/probe/src'), { recursive: true }); await mkdir(join(dir, 'scenes'), { recursive: true }); await writeFile(join(root, 'games/probe/package.json'), JSON.stringify({ name: 'probe', exports: { './project': './src/project/index.ts' } })); await writeFile(join(root, 'games/probe/src/sim.ts'), 'export const speed = 1'); await writeFile(join(dir, 'automata.project.json'), JSON.stringify({ id: 'probe', name: 'Probe', gameId: 'probe', formatVersion: 2, scenes: [{ id: 'main', path: 'scenes/main.json' }], resources: [] })); await writeFile(join(dir, 'scenes/main.json'), JSON.stringify({ id: 'main', name: 'Main', entities: [{ id: 'e', name: 'Player', enabled: true, components: [] }] })); return root }
async function fileHeadless(dir: string): Promise<HeadlessHost> { const manifest = JSON.parse(await readFile(join(dir, 'automata.project.json'), 'utf8')); const main = JSON.parse(await readFile(join(dir, 'scenes/main.json'), 'utf8')); const snapshot = { manifest, scenes: { main }, resources: {} }; const host = { get snapshot() { return snapshot }, get commands() { return [] }, listTools: () => [{ name: 'setProperty', description: '', schema: {} }], async executeTool(name: string, args: unknown): Promise<ToolResult> { if (name === 'setProperty') { snapshot.scenes.main.entities[0]!.name = (args as { value: string }).value; return { ok: true, content: { changed: true } } } return { ok: false, isError: true, content: 'nope' } }, async readResource() { return snapshot } }; return { host, registration: {}, snapshot } as unknown as HeadlessHost }
describe('Phase 1 exit criterion (scripted, no LLM)', () => {
  it('reopens durable authored work and caches successful checks across a reset', async () => {
    const root = await makeRepo(); const make = (script: SpawnResult[]): CommandSpawner => ({ async run() { const item = script.shift(); if (!item) throw new Error('unexpected'); return item } })
    const options = { repoRoot: root, sessionsRoot: join(root, '.automata/sessions'), openHeadless: fileHeadless, lock: false }
    const first = createSessionHost({ ...options, spawner: make([PASS]) }); await first.executeTool('openProject', { gameId: 'probe' }); await first.executeTool('setProperty', { value: 'Hero', clientStepId: 'rename' }); expect(await first.executeTool('runTests', {})).toMatchObject({ content: { passed: true } }); await first.executeTool('setResumePoint', { nextAction: 'continue' }); await first.dispose()
    const second = createSessionHost({ ...options, spawner: make([]) }); const reopened = await second.executeTool('openProject', { gameId: 'probe' }); expect(reopened.content).toMatchObject({ session: { resume: { nextAction: 'continue' } } }); expect(await readFile(join(root, 'games/probe/public/project/scenes/main.json'), 'utf8')).toContain('Hero'); expect(await second.executeTool('runTests', {})).toMatchObject({ content: { cached: true } }); expect(await second.executeTool('setProperty', { value: 'Hero', clientStepId: 'rename' })).toMatchObject({ content: { deduped: true } }); await second.dispose()
  })
})
