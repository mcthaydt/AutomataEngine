import { randomInt } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSeededRng, type SeededRng } from '@automata/engine'
import {
  DEFAULT_CHECK_BUDGET_LIMIT, summarizeSession,
  type BuildSession, type CheckKind, type Finding, type FindingSource, type SessionSummary, type StepRecord
} from '@automata/contracts'
import { hashJson } from './hash'
import { ARTIFACTS_DIR, acquireSessionLock, loadOrCreateSession, releaseSessionLock, saveSession, sessionDir } from './store'

export interface GuardedOutcome {
  ok: boolean
  output: unknown
  artifacts?: ReadonlyArray<{ name: string; text: string }>
}
export interface GuardedRun { cached: boolean; step: StepRecord; output: unknown }
export interface SessionEngineOptions {
  sessionsRoot: string; gameId: string; projectDir: string; engineVersion: string
  now?: () => string; seedSource?: () => number; lock?: boolean
}
export interface SessionEngine {
  readonly session: BuildSession; readonly dir: string
  save(): Promise<void>; summary(): SessionSummary
  findCompleted(kind: string, inputHash: string): StepRecord | undefined
  journalStep(kind: string, entry: { inputHash: string; result?: unknown; clientStepId?: string }): Promise<StepRecord>
  findByClientStepId(kind: string, clientStepId: string): StepRecord | undefined
  runGuarded(kind: string, input: unknown, run: () => Promise<GuardedOutcome>): Promise<GuardedRun>
  runSeededStep(kind: string, input: unknown, run: (rng: SeededRng, seed: number) => Promise<unknown>): Promise<GuardedRun>
  replayStep(stepId: string, run: (rng: SeededRng, seed: number) => Promise<unknown>): Promise<{ ok: boolean; expected?: string; actual: string }>
  addFinding(finding: Omit<Finding, 'id' | 'createdAt'>): Promise<Finding>
  autoResolve(source: FindingSource): Promise<number>
  spendBudget(kind: CheckKind): { ok: boolean; remaining: number }
  setResumePoint(nextAction: string): Promise<void>
  noteContentHash(hash: string): Promise<void>
  detectOutOfBand(currentHash: string): Promise<boolean>
  dispose(): Promise<void>
}

export async function createSessionEngine(options: SessionEngineOptions): Promise<{ engine: SessionEngine; created: boolean; quarantinedTo?: string }> {
  const now = options.now ?? (() => new Date().toISOString())
  const seedSource = options.seedSource ?? (() => randomInt(0, 0xffffffff))
  const dir = sessionDir(options.sessionsRoot, options.gameId)
  const loaded = await loadOrCreateSession({ ...options, now })
  const { session } = loaded
  if (options.lock !== false) await acquireSessionLock(dir)
  const save = async (): Promise<void> => { session.updatedAt = now(); await saveSession(dir, session) }
  const nextStepId = (): string => `step-${String(session.steps.length + 1).padStart(4, '0')}`
  const addFinding = async (finding: Omit<Finding, 'id' | 'createdAt'>): Promise<Finding> => {
    const full: Finding = { ...finding, id: `finding-${String(session.findings.length + 1).padStart(4, '0')}`, createdAt: now() }
    session.findings.push(full); await save(); return full
  }
  if (loaded.quarantinedTo) await addFinding({ source: 'session', severity: 'warning', code: 'session-quarantined', message: `Previous session file was unreadable; kept as ${loaded.quarantinedTo}`, inputHash: '' })
  const recordStep = async (step: Omit<StepRecord, 'id' | 'completedAt'>): Promise<StepRecord> => {
    const full: StepRecord = { ...step, id: nextStepId(), completedAt: now() }
    session.steps.push(full); session.resume.lastStepId = full.id; await save(); return full
  }
  const writeArtifacts = async (stepId: string, artifacts: ReadonlyArray<{ name: string; text: string }>): Promise<string[]> => {
    const paths: string[] = []
    for (const artifact of artifacts) { const rel = `${ARTIFACTS_DIR}/${stepId}-${artifact.name}`; await writeFile(join(dir, rel), artifact.text); paths.push(rel) }
    return paths
  }
  const findCompleted = (kind: string, inputHash: string): StepRecord | undefined => session.steps.find((step) => step.kind === kind && step.inputHash === inputHash && step.status === 'completed')
  const engine: SessionEngine = {
    get session() { return session }, dir, save, summary: () => summarizeSession(session), findCompleted,
    journalStep: async (kind, entry) => recordStep({ kind, inputHash: entry.inputHash, status: 'completed', artifacts: [], ...(entry.result === undefined ? {} : { result: entry.result, resultHash: hashJson(entry.result) }), ...(entry.clientStepId === undefined ? {} : { clientStepId: entry.clientStepId }) }),
    findByClientStepId: (kind, clientStepId) => session.steps.find((step) => step.kind === kind && step.clientStepId === clientStepId && step.status === 'completed'),
    async runGuarded(kind, input, run) {
      const inputHash = hashJson(input); const hit = findCompleted(kind, inputHash)
      if (hit) return { cached: true, step: hit, output: hit.result }
      const outcome = await run(); const stepId = nextStepId(); const artifacts = outcome.artifacts ? await writeArtifacts(stepId, outcome.artifacts) : []
      const step: StepRecord = { id: stepId, kind, inputHash, status: outcome.ok ? 'completed' : 'failed', resultHash: hashJson(outcome.output), result: outcome.output, artifacts, completedAt: now() }
      session.steps.push(step); session.resume.lastStepId = step.id; await save(); return { cached: false, step, output: outcome.output }
    },
    async runSeededStep(kind, input, run) {
      const inputHash = hashJson(input); const hit = findCompleted(kind, inputHash)
      if (hit) return { cached: true, step: hit, output: hit.result }
      const seed = seedSource(); const output = await run(createSeededRng(seed), seed)
      const step = await recordStep({ kind, inputHash, status: 'completed', seed, result: output, resultHash: hashJson(output), artifacts: [] })
      return { cached: false, step, output }
    },
    async replayStep(stepId, run) {
      const step = session.steps.find((candidate) => candidate.id === stepId)
      if (!step || step.seed === undefined) throw new Error(`Step "${stepId}" is not a recorded seeded step`)
      const actual = hashJson(await run(createSeededRng(step.seed), step.seed))
      return { ok: actual === step.resultHash, expected: step.resultHash, actual }
    },
    addFinding,
    async autoResolve(source) { let resolved = 0; for (const finding of session.findings) if (finding.source === source && finding.resolvedAt === undefined) { finding.resolvedAt = now(); resolved += 1 }; if (resolved) await save(); return resolved },
    spendBudget(kind) { const state = (session.budgets[kind] ??= { limit: DEFAULT_CHECK_BUDGET_LIMIT, spent: 0 }); if (state.spent >= state.limit) return { ok: false, remaining: 0 }; state.spent += 1; return { ok: true, remaining: state.limit - state.spent } },
    async setResumePoint(nextAction) { session.resume.nextAction = nextAction; await save() },
    async noteContentHash(hash) { session.lastKnownContentHash = hash; await save() },
    async detectOutOfBand(currentHash) {
      if (session.lastKnownContentHash === null || session.lastKnownContentHash === currentHash) { session.lastKnownContentHash = currentHash; await save(); return false }
      for (const step of session.steps) if (step.kind.startsWith('check:') && step.status === 'completed') step.status = 'stale'
      session.lastKnownContentHash = currentHash
      await addFinding({ source: 'session', severity: 'warning', code: 'out-of-band-changes', message: 'Files changed outside the session; cached check results were marked stale.', inputHash: currentHash })
      return true
    },
    async dispose() { await save(); if (options.lock !== false) await releaseSessionLock(dir) }
  }
  return { engine, created: loaded.created, quarantinedTo: loaded.quarantinedTo }
}
