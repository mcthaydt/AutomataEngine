import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openSessionStore } from '../../src/session/store'

const roots: string[] = []
async function repo(): Promise<string> { const d = await mkdtemp(join(tmpdir(), 'automata-store-')); roots.push(d); return d }
afterEach(async () => { await Promise.all(roots.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })

describe('SessionStore', () => {
  it('persists results and rehydrates them after release', async () => {
    const root = await repo()
    const store = await openSessionStore(root, { now: () => 1000 })
    await store.setActiveProject('beacon-run')
    await store.recordResult('beacon-run',
      { step: 'build', ok: true, inputHash: 'h1', ts: 1000, durationMs: 5, summary: 'ok', detail: {} },
      [])
    await store.release()

    const reopened = await openSessionStore(root)
    expect(reopened.state.activeProjectId).toBe('beacon-run')
    expect(reopened.getResult('beacon-run', 'build')?.inputHash).toBe('h1')
    await reopened.release()
  })

  it('accumulates budgets per step', async () => {
    const root = await repo()
    const store = await openSessionStore(root, { now: () => 0 })
    const r = (ms: number) => ({ step: 'build', ok: true, inputHash: 'h', ts: 0, durationMs: ms, summary: '', detail: {} })
    await store.recordResult('g', r(3), [])
    await store.recordResult('g', r(7), [])
    expect(store.state.budgets.build).toEqual({ runs: 2, totalMs: 10 })
    await store.release()
  })

  it('fails fresh on a corrupt state file, preserving a .bak', async () => {
    const root = await repo()
    const first = await openSessionStore(root)
    await first.release()
    await writeFile(join(first.dir, 'session.json'), '{ not json')
    const store = await openSessionStore(root)
    expect(store.state.activeProjectId).toBeNull()
    await expect(readFile(join(store.dir, 'session.json.bak'), 'utf8')).resolves.toContain('not json')
    await store.release()
  })

  it('refuses a second live store on the same repo', async () => {
    const root = await repo()
    const store = await openSessionStore(root)
    await expect(openSessionStore(root)).rejects.toThrow(/already (holds|open)/i)
    await store.release()
  })
})
