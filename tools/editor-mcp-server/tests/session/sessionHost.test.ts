import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionHost } from '../../src/session/sessionHost'
import type { ExecFn } from '../../src/session/runner'

// session -> tests -> editor-mcp-server -> tools -> repo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

const stateDirs: string[] = []
async function stateDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'automata-session-'))
  stateDirs.push(d)
  return d
}
afterEach(async () => { await Promise.all(stateDirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })

const exec: ExecFn = async () => ({ code: 0, stdout: 'ok', stderr: '' })
const browserSmoke = async () => ({ booted: true, consoleErrors: [], frameMs: [16], screenshotPath: null })
const opts = (over: Partial<Parameters<typeof createSessionHost>[0]> = {}) =>
  ({ repoRoot: REPO_ROOT, exec, browserSmoke, ...over })

describe('SessionHost (real monorepo, fake exec/browser)', () => {
  it('hides project + run tools until a project is open, then reveals them', async () => {
    const host = await createSessionHost(opts({ stateDir: await stateDir() }))
    const before = host.listTools().map((t) => t.name)
    expect(before).toEqual(expect.arrayContaining(['createGame', 'listGames', 'openProject', 'sessionStatus']))
    expect(before).not.toContain('runBuild')
    expect(before).not.toContain('addEntity')

    const changed = vi.fn()
    host.bindNotifications(changed)
    const opened = await host.executeTool('openProject', { gameId: 'monkey-ball' })
    expect(opened.ok).toBe(true)
    expect(changed).toHaveBeenCalled()

    const after = host.listTools().map((t) => t.name)
    expect(after).toEqual(expect.arrayContaining(['addEntity', 'validate', 'runBuild', 'runTests', 'browserSmoke']))
    await host.close()
  })

  it('errors run/authoring tools when no project is open', async () => {
    const host = await createSessionHost(opts({ stateDir: await stateDir() }))
    expect(await host.executeTool('runBuild', {})).toMatchObject({ ok: false, isError: true })
    expect(await host.executeTool('addEntity', {})).toMatchObject({ ok: false, isError: true })
    await host.close()
  })

  it('reports step freshness and caches build across a rehydrate', async () => {
    const dir = await stateDir()
    const build = vi.fn(exec)
    const host = await createSessionHost(opts({ stateDir: dir, exec: build }))
    await host.executeTool('openProject', { gameId: 'monkey-ball' })
    await host.executeTool('runBuild', {})
    const status = await host.executeTool('sessionStatus', {})
    expect(status.content).toMatchObject({ activeProjectId: 'monkey-ball', steps: { build: 'fresh' } })
    await host.close()

    // A fresh server on the same state dir rehydrates the active project and the cache.
    const resumed = await createSessionHost(opts({ stateDir: dir, exec: build }))
    expect(resumed.listTools().map((t) => t.name)).toContain('runBuild')
    await resumed.executeTool('runBuild', {})
    expect(build).toHaveBeenCalledTimes(1) // cached; not rebuilt
    await resumed.close()
  })

  it('swaps the active project on a second openProject', async () => {
    const host = await createSessionHost(opts({ stateDir: await stateDir() }))
    await host.executeTool('openProject', { gameId: 'monkey-ball' })
    const swap = await host.executeTool('openProject', { gameId: 'pulsebreak' })
    expect(swap.ok).toBe(true)
    expect((await host.executeTool('sessionStatus', {})).content).toMatchObject({ activeProjectId: 'pulsebreak' })
    await host.close()
  })
})
