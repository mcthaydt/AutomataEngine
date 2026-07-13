import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildSessionSchema, createBuildSession, type BuildSession } from '@automata/contracts'

export const SESSION_FILE = 'session.json'
export const ARTIFACTS_DIR = 'artifacts'
const LOCK_FILE = 'lock'

export class LockHeldError extends Error {}

export function sessionDir(sessionsRoot: string, gameId: string): string {
  return join(sessionsRoot, gameId)
}

export interface LoadedSession {
  session: BuildSession
  created: boolean
  /** Basename of the quarantined file when the on-disk session was unreadable. */
  quarantinedTo?: string
}

export async function loadOrCreateSession(opts: {
  sessionsRoot: string
  gameId: string
  projectDir: string
  engineVersion: string
  now?: () => string
}): Promise<LoadedSession> {
  const now = opts.now ?? (() => new Date().toISOString())
  const dir = sessionDir(opts.sessionsRoot, opts.gameId)
  await mkdir(join(dir, ARTIFACTS_DIR), { recursive: true })

  let text: string | undefined
  try {
    text = await readFile(join(dir, SESSION_FILE), 'utf8')
  } catch {
    text = undefined
  }

  let quarantinedTo: string | undefined
  if (text !== undefined) {
    try {
      return { session: buildSessionSchema.parse(JSON.parse(text)), created: false }
    } catch {
      quarantinedTo = `session.quarantined-${Date.now()}.json`
      await rename(join(dir, SESSION_FILE), join(dir, quarantinedTo))
    }
  }

  const session = createBuildSession({
    gameId: opts.gameId, projectDir: opts.projectDir, engineVersion: opts.engineVersion, now: now()
  })
  await saveSession(dir, session)
  return { session, created: true, quarantinedTo }
}

/** Atomic write: tmp file in the same dir, then rename over session.json. */
export async function saveSession(dir: string, session: BuildSession): Promise<void> {
  const tmp = join(dir, `${SESSION_FILE}.tmp-${process.pid}`)
  await writeFile(tmp, `${JSON.stringify(session, null, 2)}\n`)
  await rename(tmp, join(dir, SESSION_FILE))
}

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function acquireSessionLock(dir: string, pid = process.pid): Promise<void> {
  const path = join(dir, LOCK_FILE)
  try {
    const holder = JSON.parse(await readFile(path, 'utf8')) as { pid?: number }
    if (typeof holder.pid === 'number' && holder.pid !== pid && pidIsAlive(holder.pid)) {
      throw new LockHeldError(`Session locked by live pid ${holder.pid} (${path})`)
    }
  } catch (error) {
    if (error instanceof LockHeldError) throw error
  }
  await writeFile(path, JSON.stringify({ pid, startedAt: new Date().toISOString() }))
}

export async function releaseSessionLock(dir: string): Promise<void> {
  await rm(join(dir, LOCK_FILE), { force: true })
}
