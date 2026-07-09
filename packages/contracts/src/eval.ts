import { z } from 'zod'

const metricValueSchema = z.union([z.number(), z.string(), z.boolean()])

/** Provider- and game-neutral evaluation result shared by editor, agent, and MCP. */
export const projectEvaluationResultSchema = z.object({
  outcome: z.enum(['passed', 'failed', 'incomplete']),
  score: z.number(),
  metrics: z.record(z.string(), metricValueSchema),
  steps: z.number().int().nonnegative()
})
export type ProjectEvaluationResult = z.infer<typeof projectEvaluationResultSchema>

/** Bounded evaluation request accepted by the generic evaluate tool. Omitting
 * maxSteps applies a generous default so callers can evaluate without a bound;
 * the advertised tool schema reflects this (the field is optional, default 1000). */
export const projectEvaluationOptionsSchema = z.object({
  maxSteps: z.number().int().positive().default(1000)
})
export type ProjectEvaluationOptions = z.infer<typeof projectEvaluationOptionsSchema>
