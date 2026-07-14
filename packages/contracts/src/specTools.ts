import { z } from 'zod'
import type { ToolDef } from './tools'
import { gameSlugSchema } from './workspaceTools'
import { gameSpecDraftSchema, specTranslationSchema } from './gameSpec'

/** GameSpec tool contracts: compile/read the spec, render the design brief, record the checkpoint. */
export type SpecToolName = 'compileGameSpec' | 'getGameSpec' | 'renderDesignBrief' | 'recordDesignDecision'

export const specToolArgSchemas = {
  compileGameSpec: z.object({
    gameId: gameSlugSchema,
    draft: z.record(z.string(), z.unknown()),
    prompt: z.string().min(1).max(4000),
    translations: z.array(specTranslationSchema).max(20).default([]),
    changeReason: z.string().min(1).max(400).optional()
  }),
  getGameSpec: z.object({ gameId: gameSlugSchema }),
  renderDesignBrief: z.object({ gameId: gameSlugSchema }),
  recordDesignDecision: z.object({
    gameId: gameSlugSchema,
    decision: z.enum(['approve', 'reject']),
    reason: z.string().min(1).max(400)
  })
} as const satisfies Record<SpecToolName, z.ZodType>

const SPEC_TOOL_DESCRIPTIONS: Record<SpecToolName, string> = {
  compileGameSpec:
    'Validate an agent-authored GameSpec draft against the supported envelope, then version and persist ' +
    'it to games/<gameId>/gamespec.json as a hash-guarded seeded step. Failures return typed findings and ' +
    'write nothing. Recompiling an approved spec requires changeReason and bumps specVersion, re-opening ' +
    'the design checkpoint. Draft JSON schema: ' + JSON.stringify(z.toJSONSchema(gameSpecDraftSchema)),
  getGameSpec: 'Read a game\'s current GameSpec, its specVersion, and the design-checkpoint status.',
  renderDesignBrief:
    'Render the current GameSpec into a human-readable markdown design brief (persisted as a session ' +
    'artifact). Required before recordDesignDecision so the decision always covers the reviewed spec.',
  recordDesignDecision:
    'Record the human design-checkpoint decision (approve/reject + reason) in the durable session ledger. ' +
    'Approve freezes the current specVersion; it fails if the spec changed since its brief was rendered.'
}

const SPEC_TOOL_NAMES = Object.keys(specToolArgSchemas) as SpecToolName[]

export function specToolDefs(): ToolDef[] {
  return SPEC_TOOL_NAMES.map((name) => ({
    name,
    description: SPEC_TOOL_DESCRIPTIONS[name],
    schema: z.toJSONSchema(specToolArgSchemas[name])
  }))
}

export function parseSpecToolArgs(name: string, args: unknown): unknown {
  const schema: z.ZodType | undefined = (specToolArgSchemas as Record<string, z.ZodType>)[name]
  if (!schema) throw new Error(`Unknown spec tool "${name}"`)
  return schema.parse(args)
}
