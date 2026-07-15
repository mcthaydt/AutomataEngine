import { spawn } from 'node:child_process'
import type { CheckKind, FindingSource } from '@automata/contracts'
import { hashJson } from './hash'
import type { SessionEngine } from './engine'

export interface SpawnResult { code: number | null; stdout: string; stderr: string; timedOut: boolean }
export interface CommandSpawner {
  run(cmd: string, args: readonly string[], opts: { cwd: string; env?: Record<string, string>; timeoutMs: number }): Promise<SpawnResult>
}
export const nodeSpawner: CommandSpawner = {
  run(cmd, args, opts) {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''; let stderr = ''; let timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, opts.timeoutMs)
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
      child.on('error', (error) => { clearTimeout(timer); reject(error) })
      child.on('close', (code) => { clearTimeout(timer); resolvePromise({ code, stdout, stderr, timedOut }) })
    })
  }
}
export interface CheckCommand { cmd: string; args: string[]; env?: Record<string, string>; timeoutMs: number }
/** The closed check vocabulary. `evaluate` is in-process and spawns nothing. */
export function checkCommands(kind: CheckKind, gameId: string, opts: { needsInstall?: boolean; scope?: string } = {}): CheckCommand[] {
  switch (kind) {
    case 'build': return [...(opts.needsInstall ? [{ cmd: 'npm', args: ['install', '--no-audit', '--no-fund'], timeoutMs: 600_000 }] : []), { cmd: 'npm', args: ['run', 'build', '-w', gameId], timeoutMs: 600_000 }]
    case 'test': return [{ cmd: 'npx', args: ['vitest', 'run', '--project', gameId, ...(opts.scope ? ['-t', opts.scope] : [])], timeoutMs: 600_000 }]
    case 'browser': return [{ cmd: 'npx', args: ['playwright', 'test', `games/${gameId}/e2e`], env: { PLAYWRIGHT_ONLY: gameId }, timeoutMs: 900_000 }]
    case 'evaluate': return []
  }
}
const FINDING_SOURCE: Record<CheckKind, FindingSource> = { build: 'build', test: 'test', browser: 'browser', evaluate: 'eval' }
export interface CheckReport { kind: CheckKind; passed: boolean; cached: boolean; exitCode: number | null; findingIds: string[]; artifacts: string[] }
export type CheckOutcome = CheckReport | { refused: 'budget-exhausted'; kind: CheckKind }
function tail(text: string, max = 4000): string { return text.length <= max ? text : text.slice(text.length - max) }
export async function runCheck(engine: SessionEngine, spawner: CommandSpawner, repoRoot: string, kind: CheckKind, gameId: string, contentHash: string, opts: { needsInstall?: boolean; scope?: string } = {}): Promise<CheckOutcome> {
  if (kind === 'evaluate') throw new Error('evaluate is in-process; it is not a spawned check')
  const stepKind = `check:${kind}`; const input = { kind, gameId, scope: opts.scope ?? null, contentHash }
  if (!engine.findCompleted(stepKind, hashJson(input))) {
    const budget = engine.spendBudget(kind)
    if (!budget.ok) { await engine.addFinding({ source: 'session', severity: 'error', code: 'budget-exhausted', message: `Attempt budget for ${kind} is exhausted (${engine.session.budgets[kind]?.limit ?? 0}).`, inputHash: contentHash }); return { refused: 'budget-exhausted', kind } }
  }
  const guarded = await engine.runGuarded(stepKind, input, async () => {
    const artifacts: Array<{ name: string; text: string }> = []; let exitCode: number | null = 0; let timedOut = false; let combined = ''
    for (const [index, command] of checkCommands(kind, gameId, opts).entries()) {
      const result = await spawner.run(command.cmd, command.args, { cwd: repoRoot, env: command.env, timeoutMs: command.timeoutMs })
      combined += `${result.stdout}\n${result.stderr}`; artifacts.push({ name: `${index}.log`, text: `$ ${command.cmd} ${command.args.join(' ')}\n${result.stdout}\n${result.stderr}` })
      if (result.timedOut || result.code !== 0) { exitCode = result.code; timedOut = result.timedOut; break }
    }
    return {
      ok: true,
      output: { passed: !timedOut && exitCode === 0, exitCode, timedOut, tail: tail(combined), contentHash, scope: opts.scope ?? null },
      artifacts
    }
  })
  const output = guarded.output as { passed: boolean; exitCode: number | null; timedOut: boolean; tail: string; contentHash: string; scope: string | null }; const findingIds: string[] = []
  if (!guarded.cached) {
    if (output.passed) await engine.autoResolve(FINDING_SOURCE[kind])
    else { const finding = await engine.addFinding({ source: FINDING_SOURCE[kind], severity: 'error', code: output.timedOut ? `${kind}-timeout` : `${kind}-failed`, message: tail(output.tail), inputHash: contentHash }); findingIds.push(finding.id) }
  }
  return { kind, passed: output.passed, cached: guarded.cached, exitCode: output.exitCode, findingIds, artifacts: guarded.step.artifacts }
}
