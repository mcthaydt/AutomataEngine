import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolResult } from '@automata/contracts'
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
})
