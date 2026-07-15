import { z } from 'zod'
import type { ToolDef } from './tools'
import { gameSlugSchema } from './workspaceTools'

/** Phase 3 tools: compose an approved spec, render evidence, record the slice checkpoint. */
export type ComposeToolName = 'composeGame' | 'renderSliceReport' | 'recordSliceDecision'

export const composeToolArgSchemas = {
  composeGame: z.strictObject({ gameId: gameSlugSchema }),
  renderSliceReport: z.strictObject({ gameId: gameSlugSchema }),
  recordSliceDecision: z.strictObject({
    gameId: gameSlugSchema,
    decision: z.enum(['approve', 'reject']),
    reason: z.string().min(1).max(400)
  })
} as const satisfies Record<ComposeToolName, z.ZodType>

const DESCRIPTIONS: Record<ComposeToolName, string> = {
  composeGame: 'Compose the playable artifact from the approved GameSpec as a hash-guarded seeded step.',
  renderSliceReport: 'Assemble and persist the vertical-slice evidence report for the current hashes and gates.',
  recordSliceDecision: 'Record the human vertical-slice checkpoint decision; approval requires all four gates green.'
}

const NAMES = Object.keys(composeToolArgSchemas) as ComposeToolName[]

export function composeToolDefs(): ToolDef[] {
  return NAMES.map((name) => ({ name, description: DESCRIPTIONS[name], schema: z.toJSONSchema(composeToolArgSchemas[name]) }))
}

export function parseComposeToolArgs(name: string, args: unknown): unknown {
  const schema = (composeToolArgSchemas as Record<string, z.ZodType>)[name]
  if (!schema) throw new Error(`Unknown compose tool "${name}"`)
  return schema.parse(args)
}
