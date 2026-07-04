import { z } from 'zod'
import { gameSlugSchema } from './workspaceTools'

/**
 * Workspace-mode MCP prompts. `build-game` converts a one-line game
 * description into the full paved-road workflow, so an agent that starts
 * from "make me a game about X" is steered through authoring and
 * evaluation instead of stopping at the scaffold.
 */

/* Type aliases (not interfaces) so results satisfy the MCP SDK's
 * index-signature result types structurally. */
export type PromptArgumentDef = {
  name: string
  description: string
  required: boolean
}

export type PromptDef = {
  name: string
  description: string
  arguments: PromptArgumentDef[]
}

export type PromptResult = {
  description: string
  messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }>
}

const buildGameArgsSchema = z.object({
  description: z.string().min(1),
  name: gameSlugSchema.optional()
})

const BUILD_GAME: PromptDef = {
  name: 'build-game',
  description:
    'Turn a one-line game description into the full AutomataEngine workflow: scaffold, install, author over MCP, evaluate, iterate.',
  arguments: [
    { name: 'description', description: 'What the game should be, in plain language.', required: true },
    { name: 'name', description: 'Optional lowercase-slug package name for the new game.', required: false }
  ]
}

export function workspacePromptDefs(): PromptDef[] {
  return [BUILD_GAME]
}

export function getWorkspacePrompt(name: string, args: unknown): PromptResult {
  if (name !== BUILD_GAME.name) throw new Error(`Unknown prompt "${name}"`)
  const { description, name: slug } = buildGameArgsSchema.parse(args ?? {})
  return {
    description: BUILD_GAME.description,
    messages: [{ role: 'user', content: { type: 'text', text: buildGameText(description, slug) } }]
  }
}

function buildGameText(description: string, slug?: string): string {
  const name = slug ?? '<name>'
  return `Build a game in this AutomataEngine workspace from the following description. Work the whole workflow below — do not stop after scaffolding.

Game description:
${description}

Workflow:
1. ${slug ? `Call the createGame tool with name "${slug}".` : 'Pick a lowercase-slug name that fits the description and call the createGame tool with it.'}
2. Run \`npm install\` at the repo root so Node can resolve the new workspace package.
3. The scaffold is a generic "beacon runner" skeleton, not the described game. Rewrite games/${name}/src/sim/sim.ts (keep it a deterministic, fixed-dt, pure step function — no Math.random inside step) and src/game/gameplay.ts to implement the described mechanics, updating the game's tests as you go.
4. Reconnect this MCP server with \`--project games/${name}/public/project\`. In project mode the authoring tools (addEntity, addComponent, addResource, setProperty, ...) carry each component/resource type's JSON schema in their descriptions — author to those schemas.
5. Author the content: place entities in the scene, set the tuning resource, and keep the validate tool returning zero errors.
6. Run the evaluate tool and iterate on tuning until the metrics match the description's intent.
7. Project JSON under public/project is generated — edit src/project/template.ts and regenerate (see the game's README and scripts/) rather than hand-editing JSON.
8. Finish with \`npm run ci\` at the repo root and confirm it is green.

Conventions: gameId === package name === games/<dir> name; schemas are zod authored with @automata/project helpers (vec3, color, reference, listOf, tableOf); \`npm run dev -w ${name}\` serves the game on its assigned port.`
}
