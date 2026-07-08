import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface StepResult {
  step: string; ok: boolean; inputHash: string; ts: number; durationMs: number; summary: string; detail: unknown
  /** Evaluate request options, recorded so freshness recomputes the same hash. */
  options?: unknown
}
export interface Finding {
  severity: 'error' | 'warn' | 'info'; code: string; message: string; step: string; evidence?: unknown; ts: number
}
export interface SessionState {
  id: string; createdAt: number; activeProjectId: string | null; schemaVersion: number
  results: Record<string, StepResult>
  findings: Finding[]
  budgets: Record<string, { runs: number; totalMs: number }>
}
export interface SessionStore {
  readonly state: SessionState
  readonly dir: string
  setActiveProject(gameId: string | null): Promise<void>
  recordResult(gameId: string, result: StepResult, findings: Finding[]): Promise<void>
  getResult(gameId: string, step: string): StepResult | undefined
  appendLog(entry: unknown): Promise<void>
  release(): Promise<void>
}

const SCHEMA_VERSION = 1
export function stepKey(gameId: string, step: string): string { return `${gameId}:${step}` }

function freshState(now: number): SessionState {
  return { id: `s-${now}`, createdAt: now, activeProjectId: null, schemaVersion: SCHEMA_VERSION, results: {}, findings: [], budgets: {} }
}

/** Read state.json, or fail fresh (preserving a .bak) when it is missing or corrupt. */
async function loadState(dir: string, now: number): Promise<SessionState> {
  const path = join(dir, 'session.json')
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return freshState(now)
  }
  try {
    const parsed = JSON.parse(text) as SessionState
    if (parsed.schemaVersion !== SCHEMA_VERSION) throw new Error('schema mismatch')
    return parsed
  } catch {
    await rename(path, `${path}.bak`).catch(() => {})
    return freshState(now)
  }
}

/** pid liveness probe: kill(pid, 0) throws ESRCH when the process is gone. */
function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

export async function openSessionStore(
  repoRoot: string,
  opts: { now?: () => number; stateDir?: string } = {}
): Promise<SessionStore> {
  const now = opts.now ?? Date.now
  const dir = opts.stateDir ?? join(repoRoot, '.automata', 'session')
  await mkdir(dir, { recursive: true })

  const lock = join(dir, 'lock')
  const existing = await readFile(lock, 'utf8').catch(() => null)
  if (existing) {
    const pid = Number.parseInt(existing, 10)
    if (Number.isFinite(pid) && isAlive(pid)) {
      throw new Error(`Another server already holds the session for ${repoRoot} (pid ${pid})`)
    }
  }
  await writeFile(lock, String(process.pid), 'utf8')

  const state = await loadState(dir, now())
  const persist = () => writeFile(join(dir, 'session.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await persist()

  return {
    state,
    dir,
    async setActiveProject(gameId) { state.activeProjectId = gameId; await persist() },
    async recordResult(gameId, result, findings) {
      state.results[stepKey(gameId, result.step)] = result
      const budget = state.budgets[result.step] ?? { runs: 0, totalMs: 0 }
      state.budgets[result.step] = { runs: budget.runs + 1, totalMs: budget.totalMs + result.durationMs }
      state.findings = [...state.findings.filter((f) => f.step !== result.step || f.severity === 'info'), ...findings]
      await persist()
    },
    getResult(gameId, step) { return state.results[stepKey(gameId, step)] },
    async appendLog(entry) {
      await writeFile(join(dir, 'log.jsonl'), `${JSON.stringify({ ts: now(), ...(entry as object) })}\n`, { flag: 'a' })
    },
    async release() { await rm(lock, { force: true }) }
  }
}
