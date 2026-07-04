import {
  parseWorkspaceToolArgs,
  workspaceToolDefs,
  type McpToolHost,
  type ToolResult
} from '@automata/contracts'
import { createNewGameWriter, nodeScaffoldFs, type ScaffoldFs } from '@automata/scaffold'
import { discoverGames } from './projectCatalog'

export interface WorkspaceHostOptions {
  repoRoot: string
  /** Injectable for tests; defaults to the real filesystem. */
  fs?: ScaffoldFs
}

/**
 * Workspace-level MCP host: list the games discovered by convention and
 * scaffold new ones. It never opens a project — after `createGame`, clients
 * `npm install` and reconnect with `--project games/<name>/public/project`.
 */
export function createWorkspaceHost(options: WorkspaceHostOptions): McpToolHost {
  const writeGame = createNewGameWriter(options.fs ?? nodeScaffoldFs)
  const ok = (content: unknown): ToolResult => ({ ok: true, content })
  const fail = (error: unknown): ToolResult => ({
    ok: false,
    isError: true,
    content: error instanceof Error ? error.message : String(error)
  })

  return {
    listTools: () => workspaceToolDefs(),
    async executeTool(name, args) {
      try {
        const input = parseWorkspaceToolArgs(name, args)
        if (name === 'listGames') {
          return ok({ games: await discoverGames(options.repoRoot) })
        }
        const { name: gameName, port } = input as { name: string; port?: number }
        const plan = await writeGame(options.repoRoot, gameName, port)
        return ok({
          gameDir: `games/${plan.name}`,
          devPort: plan.port,
          nextSteps: [
            'npm install  (required before Node can import the new workspace package)',
            `npm run dev -w ${plan.name}  (serves the game on port ${plan.port})`,
            `The scaffold is a generic beacon-runner skeleton: rewrite games/${plan.name}/src/sim/sim.ts and src/game/gameplay.ts to implement the intended mechanics, keeping the game's tests green`,
            `Reconnect this MCP server with --project games/${plan.name}/public/project to author content; in project mode the authoring tools carry per-type JSON schemas in their descriptions`,
            'Author entities and resources, keep the validate tool clean, then run evaluate and iterate on tuning until the metrics match the intent',
            'Finish with npm run ci at the repo root'
          ]
        })
      } catch (error) {
        return fail(error)
      }
    },
    async readResource(uri) {
      throw new Error(`Workspace mode has no resources (requested ${uri})`)
    }
  }
}
