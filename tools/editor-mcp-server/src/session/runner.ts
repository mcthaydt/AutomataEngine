import { join } from 'node:path'
import type { ToolResult } from '@automata/contracts'
import type { ProjectSnapshot } from '@automata/project'
import { hashFiles, hashStrings } from './fingerprint'
import type { Finding, SessionStore, StepResult } from './store'

export interface ExecResult { code: number; stdout: string; stderr: string }
export type ExecFn = (cmd: string, args: readonly string[], cwd: string) => Promise<ExecResult>
export interface BrowserSmokeResult { booted: boolean; consoleErrors: string[]; frameMs: number[]; screenshotPath: string | null }
export type BrowserSmokeFn = (ctx: { gameDir: string; screenshotPath: string }) => Promise<BrowserSmokeResult>

export type Step = 'build' | 'test' | 'browser' | 'evaluate'

export interface RunnerDeps {
  repoRoot: string
  gameId: string
  store: SessionStore
  snapshot: () => ProjectSnapshot
  exec: ExecFn
  browserSmoke: BrowserSmokeFn
  evaluate: (options: unknown) => Promise<ToolResult>
  now?: () => number
}

export interface Runner {
  run(step: Step, force: boolean, evaluateOptions?: unknown): Promise<ToolResult>
  freshness(step: Step): Promise<'fresh' | 'stale' | 'absent'>
}

interface StepOutcome { ok: boolean; summary: string; detail: unknown; findings: Omit<Finding, 'ts' | 'step'>[] }

export function createRunner(deps: RunnerDeps): Runner {
  const now = deps.now ?? Date.now
  const gameDir = join(deps.repoRoot, 'games', deps.gameId)
  const codeRoots = [join(gameDir, 'src'), join(gameDir, 'public', 'project')]

  const inputHash = async (step: Step, evaluateOptions?: unknown): Promise<string> => {
    switch (step) {
      case 'build':
      case 'test':
        return hashFiles(codeRoots)
      case 'browser':
        return hashFiles([join(gameDir, 'dist')])
      case 'evaluate':
        return hashStrings([JSON.stringify(deps.snapshot()), JSON.stringify(evaluateOptions ?? null)])
    }
  }

  const execute = async (step: Step, evaluateOptions?: unknown): Promise<StepOutcome> => {
    if (step === 'evaluate') {
      const result = await deps.evaluate(evaluateOptions)
      return {
        ok: result.ok,
        summary: result.ok ? 'evaluation complete' : 'evaluation failed',
        detail: result.content,
        findings: result.ok ? [] : [{ severity: 'error', code: 'evaluate-failed', message: 'evaluation reported errors', evidence: result.content }]
      }
    }
    if (step === 'browser') {
      const screenshotPath = join(deps.store.dir, 'artifacts', `${deps.gameId}-smoke.png`)
      const smoke = await deps.browserSmoke({ gameDir, screenshotPath })
      const ok = smoke.booted && smoke.consoleErrors.length === 0
      return {
        ok,
        summary: ok ? 'browser smoke passed' : 'browser smoke failed',
        detail: smoke,
        findings: ok ? [] : [{ severity: 'error', code: 'browser-smoke', message: smoke.booted ? 'console errors during boot' : 'game failed to boot', evidence: smoke.consoleErrors }]
      }
    }
    const args = step === 'build' ? ['run', 'build', '-w', deps.gameId] : ['test', '-w', deps.gameId]
    const exec = await deps.exec('npm', args, deps.repoRoot)
    const ok = exec.code === 0
    return {
      ok,
      summary: ok ? `${step} passed` : `${step} failed (exit ${exec.code})`,
      detail: { code: exec.code, log: `${exec.stdout}\n${exec.stderr}`.trim().slice(-4000) },
      findings: ok ? [] : [{ severity: 'error', code: `${step}-failed`, message: `${step} exited ${exec.code}`, evidence: exec.stderr.slice(-2000) }]
    }
  }

  return {
    async run(step, force, evaluateOptions) {
      const hash = await inputHash(step, evaluateOptions)
      const cached = deps.store.getResult(deps.gameId, step)
      if (!force && cached && cached.inputHash === hash && cached.ok) {
        return { ok: true, content: { skipped: 'cached', result: cached } }
      }
      const started = now()
      const outcome = await execute(step, evaluateOptions)
      const result: StepResult = {
        step, ok: outcome.ok, inputHash: hash, ts: started, durationMs: now() - started,
        summary: outcome.summary, detail: outcome.detail,
        ...(step === 'evaluate' ? { options: evaluateOptions } : {})
      }
      const findings: Finding[] = outcome.findings.map((f) => ({ ...f, step, ts: started }))
      await deps.store.recordResult(deps.gameId, result, findings)
      return { ok: outcome.ok, isError: !outcome.ok, content: { skipped: false, result } }
    },
    async freshness(step) {
      const cached = deps.store.getResult(deps.gameId, step)
      if (!cached) return 'absent'
      const current = step === 'evaluate' ? await inputHash(step, cached.options) : await inputHash(step)
      return current === cached.inputHash ? 'fresh' : 'stale'
    }
  }
}
