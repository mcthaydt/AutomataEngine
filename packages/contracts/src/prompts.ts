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

const buildGameSpecArgsSchema = z.object({
  description: z.string().min(1),
  name: gameSlugSchema.optional()
})

const BUILD_GAME_SPEC: PromptDef = {
  name: 'build-game-spec',
  description:
    'Compile a plain-language game description into a versioned GameSpec and drive the design checkpoint: scaffold, draft, compile, brief, human decision.',
  arguments: [
    { name: 'description', description: 'What the game should be, in plain language.', required: true },
    { name: 'name', description: 'Optional lowercase-slug package name for the new game.', required: false }
  ]
}

export function workspacePromptDefs(): PromptDef[] {
  return [BUILD_GAME, BUILD_GAME_SPEC]
}

export function getWorkspacePrompt(name: string, args: unknown): PromptResult {
  if (name === BUILD_GAME.name) {
    const { description, name: slug } = buildGameArgsSchema.parse(args ?? {})
    return {
      description: BUILD_GAME.description,
      messages: [{ role: 'user', content: { type: 'text', text: buildGameText(description, slug) } }]
    }
  }
  if (name === BUILD_GAME_SPEC.name) {
    const { description, name: slug } = buildGameSpecArgsSchema.parse(args ?? {})
    return {
      description: BUILD_GAME_SPEC.description,
      messages: [{ role: 'user', content: { type: 'text', text: buildGameSpecText(description, slug) } }]
    }
  }
  throw new Error(`Unknown prompt "${name}"`)
}

function buildGameText(description: string, slug?: string): string {
  const name = slug ?? '<name>'
  return `Build a game in this AutomataEngine workspace from the following description. Work the whole workflow below — do not stop after scaffolding.

Game description:
${description}

Workflow:
1. ${slug ? `Call the createGame tool with name "${slug}".` : 'Pick a lowercase-slug name that fits the description and call the createGame tool with it.'}
2. Call the runBuild tool with gameId "${name}" — it runs npm install for the new workspace package when needed — and confirm it reports passed.
3. The scaffold is a generic "beacon runner" skeleton, not the described game. Rewrite games/${name}/src/sim/sim.ts (keep it a deterministic, fixed-dt, pure step function — no Math.random inside step) and src/game/gameplay.ts to implement the described mechanics, updating the game's tests as you go.
4. Call the openProject tool with gameId "${name}". The authoring tools (addEntity, addComponent, addResource, setProperty, ...) then carry each component/resource type's JSON schema in their descriptions — author to those schemas. Your edits persist to disk as you make them, and the build session records progress so you can resume after any reset (check getSession).
5. Author the content: place entities in the scene, set the tuning resource, and keep the validate tool returning zero errors.
6. Run the evaluate tool and iterate on tuning until the metrics match the description's intent.
7. Project JSON under public/project is generated — edit src/project/template.ts and regenerate (see the game's README and scripts/) rather than hand-editing JSON.
8. Finish with \`npm run ci\` at the repo root and confirm it is green.

Conventions: gameId === package name === games/<dir> name; schemas are zod authored with @automata/project helpers (vec3, color, reference, listOf, tableOf); \`npm run dev -w ${name}\` serves the game on its assigned port.`
}

/** Guides the MCP-calling agent through the bounded prompt-to-spec checkpoint, not later generation work. */
function buildGameSpecText(description: string, slug?: string): string {
  const name = slug ?? '<name>'
  return `Compile the following game description into a versioned GameSpec in this AutomataEngine workspace, then drive it to the design checkpoint. You are the intent compiler's brain; the server is its bound.

Game description:
${description}

Workflow:
1. ${slug ? `Call the createGame tool with name "${slug}".` : 'Pick a lowercase-slug name that fits the description and call the createGame tool with it.'}
2. Draft a GameSpec for "${name}" following the draft JSON schema embedded in the compileGameSpec tool description. Stay inside the supported envelope (one compact district, bounded counts). Where the description asks for something unsupported, translate it to the nearest supported design and record it in translations ({requested, translatedTo, reason}) — never silently approximate. Preserve the user's fantasy, tone, and differentiators. Set identity.id to "${name}".
3. Call compileGameSpec with the draft, the original description as prompt, and your translations. If it returns findings, repair the draft and recompile — findings carry JSON paths.
4. Call renderDesignBrief and present the brief to the human verbatim for the design checkpoint.
5. After the human answers, call recordDesignDecision with approve or reject and their reason. Approval freezes this specVersion; any later change needs changeReason and re-approval.

Do not generate game code, content, or assets from the spec — that is later phases' work.`
}
