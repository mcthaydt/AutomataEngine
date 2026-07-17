import { describe, expect, it } from 'vitest'
import {
  SESSION_SCHEMA_VERSION, buildSessionSchema, createBuildSession, summarizeSession
} from '../src/session'

const NOW = '2026-07-12T00:00:00.000Z'

describe('build-session schema', () => {
  it('creates an empty v1 session that round-trips through the schema', () => {
    const session = createBuildSession({
      gameId: 'probe', projectDir: 'games/probe/public/project', engineVersion: '0.1.0', now: NOW
    })
    expect(session.version).toBe(SESSION_SCHEMA_VERSION)
    expect(session.baseline).toBeNull()
    expect(session.formatVersion).toBeNull()
    expect(buildSessionSchema.parse(JSON.parse(JSON.stringify(session)))).toEqual(session)
  })

  it('rejects unknown top-level fields and wrong versions', () => {
    const session = createBuildSession({ gameId: 'g', projectDir: 'p', engineVersion: 'e', now: NOW })
    expect(buildSessionSchema.safeParse({ ...session, extra: 1 }).success).toBe(false)
    expect(buildSessionSchema.safeParse({ ...session, version: 2 }).success).toBe(false)
  })

  it('summarizes open findings, step counts, resume, and budgets', () => {
    const session = createBuildSession({ gameId: 'g', projectDir: 'p', engineVersion: 'e', now: NOW })
    session.steps.push(
      { id: 'step-0001', kind: 'check:build', inputHash: 'a', status: 'completed', completedAt: NOW, artifacts: [] },
      { id: 'step-0002', kind: 'check:test', inputHash: 'b', status: 'stale', completedAt: NOW, artifacts: [] }
    )
    session.findings.push(
      { id: 'f1', source: 'build', severity: 'error', code: 'build-failed', message: 'boom', inputHash: 'a', createdAt: NOW },
      { id: 'f2', source: 'test', severity: 'error', code: 'test-failed', message: 'boom', inputHash: 'b', createdAt: NOW, resolvedAt: NOW }
    )
    session.resume = { lastStepId: 'step-0001', nextAction: 'fix build' }
    const summary = summarizeSession(session)
    expect(summary.completedSteps).toBe(1)
    expect(summary.staleSteps).toBe(1)
    expect(summary.openFindings.map((finding) => finding.id)).toEqual(['f1'])
    expect(summary.resume.nextAction).toBe('fix build')
  })
})
