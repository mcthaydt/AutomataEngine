import { describe, expect, it } from 'vitest'
import {
  projectEvaluationOptionsSchema,
  projectEvaluationResultSchema
} from '../src/eval'

describe('project evaluation contract', () => {
  it('parses normalized outcomes and positive max-step options', () => {
    expect(projectEvaluationResultSchema.parse({
      outcome: 'passed', score: 0.8, metrics: { timeMs: 1200, label: 'fast', stable: true }, steps: 72
    })).toMatchObject({ outcome: 'passed', score: 0.8, steps: 72 })
    expect(projectEvaluationOptionsSchema.parse({ maxSteps: 180 })).toEqual({ maxSteps: 180 })
  })

  it('rejects invalid outcomes, metrics, steps, and max-step options', () => {
    expect(projectEvaluationResultSchema.safeParse({ outcome: 'won', score: 1, metrics: {}, steps: 1 }).success).toBe(false)
    expect(projectEvaluationResultSchema.safeParse({ outcome: 'passed', score: 1, metrics: { nested: {} }, steps: 1 }).success).toBe(false)
    expect(projectEvaluationResultSchema.safeParse({ outcome: 'passed', score: 1, metrics: {}, steps: -1 }).success).toBe(false)
    expect(projectEvaluationOptionsSchema.safeParse({ maxSteps: 0 }).success).toBe(false)
    expect(projectEvaluationOptionsSchema.safeParse({ maxSteps: 1.5 }).success).toBe(false)
  })
})
