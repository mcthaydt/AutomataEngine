import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEngine } from '../src/engine'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeEngine(seedSource?: () => number) {
  const sessionsRoot = await mkdtemp(join(tmpdir(), 'bs-engine-'))
  roots.push(sessionsRoot)
  const options = {
    sessionsRoot, gameId: 'probe', projectDir: 'p', engineVersion: 'e',
    now: () => '2026-07-12T00:00:00.000Z', seedSource, lock: false
  }
  return { options, ...(await createSessionEngine(options)) }
}

describe('session engine', () => {
  it('hash-guards expensive steps: second identical run returns the recorded result', async () => {
    const { engine } = await makeEngine()
    let runs = 0
    const run = async () => {
      runs += 1
      return { ok: true, output: { passed: true }, artifacts: [{ name: 'log', text: 'hello' }] }
    }
    const first = await engine.runGuarded('check:build', { contentHash: 'h1' }, run)
    const second = await engine.runGuarded('check:build', { contentHash: 'h1' }, run)
    const third = await engine.runGuarded('check:build', { contentHash: 'h2' }, run)
    expect(runs).toBe(2)
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.output).toEqual({ passed: true })
    expect(second.step.id).toBe(first.step.id)
    expect(third.cached).toBe(false)
    expect(first.step.artifacts[0]).toMatch(/^artifacts\/step-0001-log$/)
  })

  it('survives a process reset: a fresh engine over the same dir sees steps, findings, resume', async () => {
    const { engine, options } = await makeEngine()
    await engine.runGuarded('check:build', { contentHash: 'h1' }, async () => ({ ok: true, output: 1 }))
    await engine.addFinding({ source: 'build', severity: 'error', code: 'build-failed', message: 'm', inputHash: 'h1' })
    await engine.setResumePoint('re-run build after fix')
    await engine.dispose()

    const reopened = (await createSessionEngine(options)).engine
    expect(reopened.summary().completedSteps).toBe(1)
    expect(reopened.summary().openFindings.map((finding) => finding.code)).toEqual(['build-failed'])
    expect(reopened.summary().resume.nextAction).toBe('re-run build after fix')
    const cached = await reopened.runGuarded('check:build', { contentHash: 'h1' }, async () => {
      throw new Error('must not re-run')
    })
    expect(cached.cached).toBe(true)
  })

  it('seeded steps replay deterministically; leaked randomness fails replay', async () => {
    const { engine } = await makeEngine(() => 1234)
    const seeded = await engine.runSeededStep('generate:demo', { n: 3 }, async (rng) => ({
      values: [rng.nextInt(100), rng.nextInt(100), rng.nextInt(100)]
    }))
    expect(seeded.step.seed).toBe(1234)
    const replay = await engine.replayStep(seeded.step.id, async (rng) => ({
      values: [rng.nextInt(100), rng.nextInt(100), rng.nextInt(100)]
    }))
    expect(replay.ok).toBe(true)
    expect((await engine.replayStep(seeded.step.id, async () => ({ values: [Math.random()] }))).ok).toBe(false)
  })

  it('auto-resolves findings by source, enforces budgets, and dedupes clientStepId', async () => {
    const { engine } = await makeEngine()
    await engine.addFinding({ source: 'test', severity: 'error', code: 'test-failed', message: 'm', inputHash: 'x' })
    expect(await engine.autoResolve('test')).toBe(1)
    expect(engine.summary().openFindings).toEqual([])
    engine.session.budgets.test = { limit: 2, spent: 1 }
    expect(engine.spendBudget('test')).toEqual({ ok: true, remaining: 0 })
    expect(engine.spendBudget('test')).toEqual({ ok: false, remaining: 0 })
    expect(engine.spendBudget('build').ok).toBe(true)
    const stepA = await engine.journalStep('author:addEntity', { inputHash: 'i1', clientStepId: 'c-1' })
    expect(engine.findByClientStepId('author:addEntity', 'c-1')?.id).toBe(stepA.id)
    expect(engine.findByClientStepId('author:addEntity', 'c-2')).toBeUndefined()
  })

  it('flags out-of-band changes: marks check steps stale and records a session finding', async () => {
    const { engine } = await makeEngine()
    await engine.runGuarded('check:build', { contentHash: 'h1' }, async () => ({ ok: true, output: 1 }))
    await engine.journalStep('author:setProperty', { inputHash: 'i1' })
    await engine.noteContentHash('hash-A')
    expect(await engine.detectOutOfBand('hash-A')).toBe(false)
    expect(await engine.detectOutOfBand('hash-B')).toBe(true)
    expect(engine.session.steps.map((step) => [step.kind, step.status])).toContainEqual(['check:build', 'stale'])
    expect(engine.summary().openFindings.map((finding) => finding.code)).toEqual(['out-of-band-changes'])
  })

  it('marks completed checks stale when an in-session content hash changes', async () => {
    const { engine } = await makeEngine()
    await engine.noteContentHash('h1')
    await engine.runGuarded('check:build', { contentHash: 'h1' }, async () => ({
      ok: true, output: { passed: true }
    }))
    await engine.noteContentHash('h2')
    expect(engine.session.steps.find((step) => step.kind === 'check:build')?.status).toBe('stale')
  })
})
