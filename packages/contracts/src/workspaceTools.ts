import { z } from 'zod'
import type { ToolDef } from './tools'

/**
 * Workspace-level tool contracts: operations on the monorepo itself rather
 * than one open project. Served by `automata-editor-mcp --workspace`.
 */

export type WorkspaceToolName = 'createGame' | 'listGames'

const gameSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase alphanumeric slug with optional hyphens')

export const workspaceToolArgSchemas = {
  createGame: z.object({
    name: gameSlugSchema,
    port: z.number().int().min(1).max(65_535).optional()
  }),
  listGames: z.object({})
} as const satisfies Record<WorkspaceToolName, z.ZodType>

const WORKSPACE_TOOL_DESCRIPTIONS: Record<WorkspaceToolName, string> = {
  createGame:
    'Scaffold a complete registered game under games/<name>: deterministic sim, project definition, ' +
    'editor/MCP registration, passing tests, and authored project files. Returns the game directory, ' +
    'assigned dev port, and next steps (the new package needs npm install before Node can import it).',
  listGames: 'List the game IDs discovered in this workspace via the ./project export convention.'
}

const WORKSPACE_TOOL_NAMES = Object.keys(workspaceToolArgSchemas) as WorkspaceToolName[]

export function workspaceToolDefs(): ToolDef[] {
  return WORKSPACE_TOOL_NAMES.map((name) => ({
    name,
    description: WORKSPACE_TOOL_DESCRIPTIONS[name],
    schema: z.toJSONSchema(workspaceToolArgSchemas[name])
  }))
}

export function parseWorkspaceToolArgs(name: string, args: unknown): unknown {
  const schema: z.ZodType | undefined = (workspaceToolArgSchemas as Record<string, z.ZodType>)[name]
  if (!schema) throw new Error(`Unknown workspace tool "${name}"`)
  return schema.parse(args)
}
