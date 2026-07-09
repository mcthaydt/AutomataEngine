import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createSessionHost } from '../../src/session/sessionHost'
import type { ExecFn } from '../../src/session/runner'

// session -> tests -> editor-mcp-server -> tools -> repo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const GAMES = ['monkey-ball', 'pulsebreak']

// The session points repoRoot at a throwaway COPY of the games, never the real
// monorepo: openProject wires a live write-through writer at
// <repoRoot>/games/<id>/public/project, so any authoring edit here must land in
// the copy, never the checked-in game files. Game registrations still resolve
// because loadProjectRegistration imports the installed package by name.
let sessionRepo: string
beforeAll(async () => {
  sessionRepo = await mkdtemp(join(tmpdir(), 'automata-session-repo-'))
  for (const id of GAMES) {
    await mkdir(join(sessionRepo, 'games', id), { recursive: true })
    await cp(join(REPO_ROOT, 'games', id, 'package.json'), join(sessionRepo, 'games', id, 'package.json'))
    await cp(join(REPO_ROOT, 'games', id, 'public'), join(sessionRepo, 'games', id, 'public'), { recursive: true })
  }
})
afterAll(async () => { await rm(sessionRepo, { recursive: true, force: true }) })

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
  ({ repoRoot: sessionRepo, exec, browserSmoke, ...over })

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

  it('routes evaluate through the runner and errors when no project is open', async () => {
    const host = await createSessionHost(opts({ stateDir: await stateDir() }))
    expect(await host.executeTool('evaluate', {})).toMatchObject({ ok: false, isError: true })
    await host.executeTool('openProject', { gameId: 'monkey-ball' })
    expect(await host.executeTool('evaluate', { maxSteps: 5 })).toHaveProperty('ok')
    await host.close()
  })

  it('closeProject hides the project + run tools and clears the active project', async () => {
    const host = await createSessionHost(opts({ stateDir: await stateDir() }))
    await host.executeTool('openProject', { gameId: 'monkey-ball' })
    const changed = vi.fn()
    host.bindNotifications(changed)
    expect(await host.executeTool('closeProject', {})).toMatchObject({ ok: true, content: { closed: true } })
    expect(changed).toHaveBeenCalled()
    expect(host.listTools().map((t) => t.name)).not.toContain('runBuild')
    expect((await host.executeTool('sessionStatus', {})).content).toMatchObject({ activeProjectId: null })
    await host.close()
  })

  it('serves resources only while a project is open', async () => {
    const host = await createSessionHost(opts({ stateDir: await stateDir() }))
    await expect(host.readResource('editor://project')).rejects.toThrow(/no project open/i)
    await host.executeTool('openProject', { gameId: 'monkey-ball' })
    expect(await host.readResource('editor://project')).toBeTruthy()
    await host.close()
  })

  it('persists authoring edits to the session repo copy, never the checked-in game files', async () => {
    const realScene = join(REPO_ROOT, 'games/monkey-ball/public/project/scenes/w1-l1.scene.json')
    const copyScene = join(sessionRepo, 'games/monkey-ball/public/project/scenes/w1-l1.scene.json')
    const realBefore = await readFile(realScene, 'utf8')
    const copyBefore = await readFile(copyScene, 'utf8')

    const host = await createSessionHost(opts({ stateDir: await stateDir() }))
    await host.executeTool('openProject', { gameId: 'monkey-ball' })
    const edit = await host.executeTool('addEntity', {
      sceneId: 'w1-l1',
      entity: { id: 'review-probe', name: 'review-probe', enabled: true, components: [] }
    })
    expect(edit.ok).toBe(true)
    expect(await readFile(copyScene, 'utf8')).not.toBe(copyBefore) // the edit landed in the copy
    expect(await readFile(realScene, 'utf8')).toBe(realBefore) // the real game files are untouched
    await host.close()
  })

  it('keeps serving tools when the audit log cannot be written', async () => {
    const dir = await stateDir()
    await mkdir(join(dir, 'log.jsonl')) // make the log path a directory so appendFile fails
    const host = await createSessionHost(opts({ stateDir: dir }))
    expect(await host.executeTool('listGames', {})).toMatchObject({ ok: true })
    await host.close()
  })

  it('runs tests and browser smoke through the runner and surfaces findings', async () => {
    const failingExec: ExecFn = async () => ({ code: 1, stdout: '', stderr: 'boom' })
    const host = await createSessionHost(opts({ stateDir: await stateDir(), exec: failingExec }))
    await host.executeTool('openProject', { gameId: 'monkey-ball' })
    expect(await host.executeTool('runTests', {})).toMatchObject({ ok: false })
    expect(await host.executeTool('browserSmoke', {})).toMatchObject({ ok: true })
    const status = await host.executeTool('sessionStatus', {})
    expect((status.content as { findings: unknown[] }).findings.length).toBeGreaterThan(0)
    await host.close()
  })
})
