import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openSessionStore } from '../../src/session/store'
import { createRunner, type ExecFn } from '../../src/session/runner'

const roots: string[] = []
async function gameRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'automata-runner-'))
  roots.push(root)
  await mkdir(join(root, 'games/g/src'), { recursive: true })
  await mkdir(join(root, 'games/g/public/project'), { recursive: true })
  await writeFile(join(root, 'games/g/src/index.ts'), 'export const x = 1')
  return root
}
afterEach(async () => { await Promise.all(roots.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })

const snapshot = () => ({ manifest: { id: 'g' } }) as never
const okExec: ExecFn = async () => ({ code: 0, stdout: 'built', stderr: '' })
const browser = async () => ({ booted: true, consoleErrors: [], frameMs: [16, 16], screenshotPath: 's.png' })
const evaluate = async () => ({ ok: true, content: { metrics: {} } })

function deps(root: string, exec = okExec) {
  return async () => {
    const store = await openSessionStore(root, { now: () => 1 })
    const runner = createRunner({ repoRoot: root, gameId: 'g', store, snapshot, exec, browserSmoke: browser, evaluate, now: () => 1 })
    return { store, runner }
  }
}

describe('Runner', () => {
  it('runs build once then serves it from cache until inputs change', async () => {
    const root = await gameRepo()
    const exec = vi.fn(okExec)
    const { store, runner } = await deps(root, exec)()
    const first = await runner.run('build', false)
    expect(first.content).toMatchObject({ skipped: false })
    const second = await runner.run('build', false)
    expect(second.content).toMatchObject({ skipped: 'cached' })
    expect(exec).toHaveBeenCalledTimes(1)

    await writeFile(join(root, 'games/g/src/index.ts'), 'export const x = 2')
    expect(await runner.freshness('build')).toBe('stale')
    await runner.run('build', false)
    expect(exec).toHaveBeenCalledTimes(2)
    await store.release()
  })

  it('force reruns even when cached', async () => {
    const root = await gameRepo()
    const exec = vi.fn(okExec)
    const { store, runner } = await deps(root, exec)()
    await runner.run('build', false)
    await runner.run('build', true)
    expect(exec).toHaveBeenCalledTimes(2)
    await store.release()
  })

  it('records a failing build as a result with ok:false and a finding, not a throw', async () => {
    const root = await gameRepo()
    const failing: ExecFn = async () => ({ code: 1, stdout: '', stderr: 'boom' })
    const { store, runner } = await deps(root, failing)()
    const result = await runner.run('build', false)
    expect(result.ok).toBe(false)
    expect(store.state.findings.some((f) => f.step === 'build' && f.severity === 'error')).toBe(true)
    await store.release()
  })

  it('reports absent freshness before a step has run', async () => {
    const root = await gameRepo()
    const { store, runner } = await deps(root)()
    expect(await runner.freshness('test')).toBe('absent')
    await store.release()
  })
})
