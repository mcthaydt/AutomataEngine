import { z } from 'zod'
import { parseSpecToolArgs, specToolArgSchemas } from './specTools'
import { parseToolArgs, writeToolNames, type ToolDef, type ToolName } from './tools'
import { gameSlugSchema, parseWorkspaceToolArgs, workspaceToolArgSchemas } from './workspaceTools'

/**
 * Session/check tool contracts for the single-mode workspace MCP server.
 * Checks operate on the currently open project; the vocabulary is closed —
 * there is deliberately no arbitrary-command tool.
 */
export type SessionToolName =
  | 'openProject' | 'getSession' | 'setResumePoint'
  | 'runBuild' | 'runTests' | 'runBrowserEval' | 'changedFiles'

export const sessionToolArgSchemas = {
  openProject: z.object({ gameId: gameSlugSchema }),
  getSession: z.object({}),
  setResumePoint: z.object({ nextAction: z.string().min(1) }),
  runBuild: z.object({ gameId: gameSlugSchema.optional() }),
  runTests: z.object({ gameId: gameSlugSchema.optional(), scope: z.string().min(1).optional() }),
  runBrowserEval: z.object({ gameId: gameSlugSchema.optional() }),
  changedFiles: z.object({})
} as const satisfies Record<SessionToolName, z.ZodType>

const SESSION_TOOL_DESCRIPTIONS: Record<SessionToolName, string> = {
  openProject:
    'Open (or reopen) a game project and create-or-resume its durable build session. Returns the resume ' +
    'position, outstanding findings, and completed steps so work is never blindly replayed. Opening a ' +
    'different game swaps to it; prior work is already durable.',
  getSession: 'Read the open project\'s build-session summary: resume position, findings, steps, budgets.',
  setResumePoint: 'Record the intended next action in the durable session before a context reset.',
  runBuild:
    'Install (if needed) and build a game (defaults to the open project; pass gameId to build a freshly ' +
    'scaffolded game before its first openProject). Results land as typed findings, hash-guarded.',
  runTests: 'Run a game\'s vitest suite (defaults to the open project; optional scope filter); typed findings, hash-guarded.',
  runBrowserEval: 'Run a game\'s Playwright browser evaluation (defaults to the open project); typed findings, hash-guarded.',
  changedFiles: 'List project/source files added, removed, or changed since the session baseline.'
}

const SESSION_TOOL_NAMES = Object.keys(sessionToolArgSchemas) as SessionToolName[]

export function sessionToolDefs(): ToolDef[] {
  return SESSION_TOOL_NAMES.map((name) => ({
    name,
    description: SESSION_TOOL_DESCRIPTIONS[name],
    schema: z.toJSONSchema(sessionToolArgSchemas[name])
  }))
}

export function parseSessionToolArgs(name: string, args: unknown): unknown {
  const schema: z.ZodType | undefined = (sessionToolArgSchemas as Record<string, z.ZodType>)[name]
  if (!schema) throw new Error(`Unknown session tool "${name}"`)
  return schema.parse(args)
}

/** Pull the session-layer clientStepId out of write-tool args before project validation. */
export function splitClientStepId(args: unknown): { clientStepId?: string; rest: unknown } {
  if (typeof args !== 'object' || args === null || !('clientStepId' in args)) return { rest: args }
  const { clientStepId, ...rest } = args as Record<string, unknown>
  return typeof clientStepId === 'string' ? { clientStepId, rest } : { rest }
}

/** One parser for the single-mode server: workspace, then session, then project tools. */
export function parseUnifiedToolArgs(name: string, args: unknown): unknown {
  if (name in workspaceToolArgSchemas) return parseWorkspaceToolArgs(name, args)
  if (name in sessionToolArgSchemas) return parseSessionToolArgs(name, args)
  if (name in specToolArgSchemas) return parseSpecToolArgs(name, args)
  if ((writeToolNames as readonly string[]).includes(name)) {
    return parseToolArgs(name as ToolName, splitClientStepId(args).rest)
  }
  return parseToolArgs(name as ToolName, args)
}
