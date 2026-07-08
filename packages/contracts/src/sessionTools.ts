import { z } from 'zod'
import type { ToolDef } from './tools'
import { gameSlugSchema } from './workspaceTools'

/**
 * Durable-session tool contracts: open/close a project inside a long-lived
 * workspace server, inspect session state, and run cached build/test/browser
 * steps. Served by `automata-editor-mcp --workspace`.
 */

export type SessionToolName =
  | 'openProject' | 'closeProject' | 'sessionStatus'
  | 'runBuild' | 'runTests' | 'browserSmoke'

const forceArgs = z.object({ force: z.boolean().optional() })

export const sessionToolArgSchemas = {
  openProject: z.object({ gameId: gameSlugSchema }),
  closeProject: z.object({}),
  sessionStatus: z.object({}),
  runBuild: forceArgs,
  runTests: forceArgs,
  browserSmoke: forceArgs
} as const satisfies Record<SessionToolName, z.ZodType>

const SESSION_TOOL_NAMES = Object.keys(sessionToolArgSchemas) as SessionToolName[]

const SESSION_TOOL_DESCRIPTIONS: Record<SessionToolName, string> = {
  openProject: 'Open a discovered game as the session\'s active project (loads from disk, applying migrations). Reveals the project authoring and run tools. Opening a second project swaps: the current one is flushed and closed first.',
  closeProject: 'Close the active project and hide its authoring and run tools.',
  sessionStatus: 'Report the active project, each step\'s freshness (fresh/stale/absent), open findings, and recorded budgets.',
  runBuild: 'Build the active game, caching by an input fingerprint; an unchanged fingerprint returns the cached result unless force is set.',
  runTests: 'Run the active game\'s tests, caching by an input fingerprint; force reruns.',
  browserSmoke: 'Boot the built game in a headless browser and capture boot/console/frame-time plus a screenshot, caching by the build artifact fingerprint; force reruns.'
}

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
