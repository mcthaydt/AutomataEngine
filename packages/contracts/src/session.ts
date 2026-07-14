import { z } from 'zod'

/** Durable build-session document — the Phase 1 contract every phase builds on. */
export const SESSION_SCHEMA_VERSION = 1

export const checkKindSchema = z.enum(['build', 'test', 'browser', 'evaluate'])
export type CheckKind = z.infer<typeof checkKindSchema>

export const findingSourceSchema = z.enum(['build', 'test', 'browser', 'eval', 'validate', 'session', 'spec'])
export type FindingSource = z.infer<typeof findingSourceSchema>

export const findingSchema = z.strictObject({
  id: z.string(),
  source: findingSourceSchema,
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string(),
  message: z.string(),
  location: z.string().optional(),
  inputHash: z.string(),
  createdAt: z.string(),
  resolvedAt: z.string().optional()
})
export type Finding = z.infer<typeof findingSchema>

export const stepStatusSchema = z.enum(['completed', 'failed', 'stale'])

export const stepRecordSchema = z.strictObject({
  id: z.string(),
  kind: z.string(),
  inputHash: z.string(),
  resultHash: z.string().optional(),
  status: stepStatusSchema,
  seed: z.number().int().optional(),
  clientStepId: z.string().optional(),
  completedAt: z.string(),
  artifacts: z.array(z.string()),
  result: z.unknown().optional()
})
export type StepRecord = z.infer<typeof stepRecordSchema>

export const budgetStateSchema = z.strictObject({
  limit: z.number().int().positive(),
  spent: z.number().int().nonnegative()
})
export type BudgetState = z.infer<typeof budgetStateSchema>

export const DEFAULT_CHECK_BUDGET_LIMIT = 25

export const baselineSchema = z.strictObject({
  gitRef: z.string().optional(),
  contentHash: z.string(),
  files: z.record(z.string(), z.string())
})
export type Baseline = z.infer<typeof baselineSchema>

export const resumeSchema = z.strictObject({
  lastStepId: z.string().optional(),
  nextAction: z.string().optional()
})

export const buildSessionSchema = z.strictObject({
  version: z.literal(SESSION_SCHEMA_VERSION),
  gameId: z.string(),
  projectDir: z.string(),
  engineVersion: z.string(),
  formatVersion: z.number().int().nullable(),
  baseline: baselineSchema.nullable(),
  lastKnownContentHash: z.string().nullable(),
  steps: z.array(stepRecordSchema),
  findings: z.array(findingSchema),
  budgets: z.record(z.string(), budgetStateSchema),
  resume: resumeSchema,
  createdAt: z.string(),
  updatedAt: z.string()
})
export type BuildSession = z.infer<typeof buildSessionSchema>

export function createBuildSession(init: {
  gameId: string
  projectDir: string
  engineVersion: string
  now: string
}): BuildSession {
  return {
    version: SESSION_SCHEMA_VERSION,
    gameId: init.gameId,
    projectDir: init.projectDir,
    engineVersion: init.engineVersion,
    formatVersion: null,
    baseline: null,
    lastKnownContentHash: null,
    steps: [],
    findings: [],
    budgets: {},
    resume: {},
    createdAt: init.now,
    updatedAt: init.now
  }
}

export interface SessionSummary {
  gameId: string
  resume: z.infer<typeof resumeSchema>
  completedSteps: number
  staleSteps: number
  openFindings: Finding[]
  budgets: Record<string, BudgetState>
  updatedAt: string
}

export function summarizeSession(session: BuildSession): SessionSummary {
  return {
    gameId: session.gameId,
    resume: session.resume,
    completedSteps: session.steps.filter((step) => step.status === 'completed').length,
    staleSteps: session.steps.filter((step) => step.status === 'stale').length,
    openFindings: session.findings.filter((finding) => finding.resolvedAt === undefined),
    budgets: session.budgets,
    updatedAt: session.updatedAt
  }
}
