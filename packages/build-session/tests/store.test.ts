import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LockHeldError, acquireSessionLock, loadOrCreateSession, releaseSessionLock, saveSession, sessionDir
} from '../src/store'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bs-store-'))
  roots.push(root)
  return root
}

const OPTS = { gameId: 'probe', projectDir: 'games/probe/public/project', engineVersion: '0.1.0' }

describe('session store', () => {
  it('creates a fresh session with dirs, then reloads the same document', async () => {
    const sessionsRoot = await makeRoot()
    const first = await loadOrCreateSession({ sessionsRoot, ...OPTS })
    expect(first.created).toBe(true)
    first.session.resume = { nextAction: 'author content' }
    await saveSession(sessionDir(sessionsRoot, 'probe'), first.session)

    const second = await loadOrCreateSession({ sessionsRoot, ...OPTS })
    expect(second.created).toBe(false)
    expect(second.session.resume.nextAction).toBe('author content')
    const names = await readdir(sessionDir(sessionsRoot, 'probe'))
    expect(names.filter((name) => name.includes('.tmp'))).toEqual([])
  })

  it('quarantines corrupt and unknown-version session files instead of discarding them', async () => {
    const sessionsRoot = await makeRoot()
    const dir = sessionDir(sessionsRoot, 'probe')
    await loadOrCreateSession({ sessionsRoot, ...OPTS })
    await writeFile(join(dir, 'session.json'), '{ not json')

    const recovered = await loadOrCreateSession({ sessionsRoot, ...OPTS })
    expect(recovered.created).toBe(true)
    expect(recovered.quarantinedTo).toMatch(/session\.quarantined-\d+\.json$/)
    await expect(readFile(join(dir, recovered.quarantinedTo!), 'utf8')).resolves.toContain('not json')

    await writeFile(join(dir, 'session.json'), JSON.stringify({ ...recovered.session, version: 99 }))
    const again = await loadOrCreateSession({ sessionsRoot, ...OPTS })
    expect(again.quarantinedTo).toBeDefined()
  })

  it('locks a session against a live pid and reclaims stale locks', async () => {
    const sessionsRoot = await makeRoot()
    const dir = sessionDir(sessionsRoot, 'probe')
    await loadOrCreateSession({ sessionsRoot, ...OPTS })

    await acquireSessionLock(dir)
    await acquireSessionLock(dir)
    await releaseSessionLock(dir)

    await writeFile(join(dir, 'lock'), JSON.stringify({ pid: 999999999, startedAt: 'x' }))
    await acquireSessionLock(dir)

    await writeFile(join(dir, 'lock'), JSON.stringify({ pid: process.ppid, startedAt: 'x' }))
    await expect(acquireSessionLock(dir)).rejects.toBeInstanceOf(LockHeldError)
  })
})
