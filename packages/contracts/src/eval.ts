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

/** Bounded evaluation request accepted by the generic evaluate tool. */
export const projectEvaluationOptionsSchema = z.object({
  maxSteps: z.number().int().positive()
})
export type ProjectEvaluationOptions = z.infer<typeof projectEvaluationOptionsSchema>
