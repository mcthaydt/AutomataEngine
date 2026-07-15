import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEngine } from '../src/engine'
import { checkCommands, nodeSpawner, runCheck, type CommandSpawner, type SpawnResult } from '../src/checks'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
async function makeEngine() {
  const sessionsRoot = await mkdtemp(join(tmpdir(), 'bs-checks-')); roots.push(sessionsRoot)
  return (await createSessionEngine({ sessionsRoot, gameId: 'probe', projectDir: 'p', engineVersion: 'e', lock: false, now: () => '2026-07-12T00:00:00.000Z' })).engine
}
function scriptedSpawner(results: SpawnResult[]): CommandSpawner & { calls: string[][] } {
  const calls: string[][] = []
  return { calls, async run(cmd, args) { calls.push([cmd, ...args]); const next = results.shift(); if (!next) throw new Error('unexpected spawn'); return next } }
}
const OK: SpawnResult = { code: 0, stdout: 'fine', stderr: '', timedOut: false }
const FAIL: SpawnResult = { code: 1, stdout: 'x'.repeat(5000), stderr: 'boom', timedOut: false }

describe('check commands', () => {
  it('builds the closed command vocabulary', () => {
    expect(checkCommands('build', 'probe', { needsInstall: true }).map((c) => [c.cmd, ...c.args])).toEqual([['npm', 'install', '--no-audit', '--no-fund'], ['npm', 'run', 'build', '-w', 'probe']])
    expect(checkCommands('test', 'probe', { scope: 'sim' })[0]!.args).toEqual(['vitest', 'run', '--project', 'probe', '-t', 'sim'])
    expect(checkCommands('browser', 'probe')[0]!.env).toEqual({ PLAYWRIGHT_ONLY: 'probe' })
    expect(checkCommands('evaluate', 'probe')).toEqual([])
  })
})
describe('runCheck', () => {
  it('records check provenance in the durable step result', async () => {
    const engine = await makeEngine()
    await runCheck(engine, scriptedSpawner([OK]), '/repo', 'test', 'probe', 'hash-A', { scope: 'sim' })
    expect(engine.session.steps.find((step) => step.kind === 'check:test')?.result).toMatchObject({
      contentHash: 'hash-A',
      scope: 'sim'
    })
  })

  it('passing check writes an artifact, resolves findings, and caches repeat work', async () => {
    const engine = await makeEngine(); await engine.addFinding({ source: 'build', severity: 'error', code: 'build-failed', message: 'old', inputHash: 'h0' })
    const report = await runCheck(engine, scriptedSpawner([OK]), '/repo', 'build', 'probe', 'hash-A')
    if ('refused' in report) throw new Error('unexpected refusal')
    expect(report.passed).toBe(true); expect(engine.summary().openFindings).toEqual([])
    await expect(readFile(join(engine.dir, report.artifacts[0]!), 'utf8')).resolves.toContain('fine')
    const again = await runCheck(engine, scriptedSpawner([]), '/repo', 'build', 'probe', 'hash-A')
    if ('refused' in again) throw new Error('unexpected refusal')
    expect(again.cached).toBe(true); expect(engine.session.budgets.build!.spent).toBe(1)
  })
  it('maps failures, timeouts, budgets, and evaluate misuse into the prescribed outcomes', async () => {
    const engine = await makeEngine()
    const failed = await runCheck(engine, scriptedSpawner([FAIL]), '/repo', 'test', 'probe', 'h')
    if ('refused' in failed) throw new Error('unexpected refusal')
    expect(failed.passed).toBe(false); expect(engine.summary().openFindings[0]!.message).toContain('boom')
    const timed = await runCheck(await makeEngine(), scriptedSpawner([{ code: null, stdout: '', stderr: '', timedOut: true }]), '/repo', 'browser', 'probe', 'h')
    if ('refused' in timed) throw new Error('unexpected refusal')
    expect(timed.kind).toBe('browser')
    engine.session.budgets.build = { limit: 0, spent: 0 }
    expect(await runCheck(engine, scriptedSpawner([]), '/repo', 'build', 'probe', 'new')).toEqual({ refused: 'budget-exhausted', kind: 'build' })
    await expect(runCheck(engine, scriptedSpawner([]), '/repo', 'evaluate', 'probe', 'x')).rejects.toThrow(/in-process/i)
  })
  it('nodeSpawner captures real output and failures', async () => {
    const result = await nodeSpawner.run('node', ['-e', 'console.log("out"); console.error("err"); process.exit(3)'], { cwd: process.cwd(), timeoutMs: 30_000 })
    expect(result).toMatchObject({ code: 3, timedOut: false }); expect(result.stdout).toContain('out'); expect(result.stderr).toContain('err')
  })
})
