import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { archetypeLibraryKind, parseData } from '@automata/engine/data'
import { registerEditorProject, type RegisteredEditorProject } from '@automata/editor/headless'
import { evaluateMonkeyBallProject, monkeyBallProjectDefinition } from 'monkey-ball/project'
import { evaluatePulsebreakProject, pulsebreakProjectDefinition } from 'pulsebreak/project'

export const PROJECT_GAME_IDS = ['monkey-ball', 'pulsebreak'] as const
export type ProjectGameId = typeof PROJECT_GAME_IDS[number]

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const monkeyBallArchetypes = resolve(
  repoRoot,
  'games/monkey-ball/public/data/archetypes/standard.yaml'
)

let monkeyBallRegistration: Promise<RegisteredEditorProject> | undefined

async function loadMonkeyBallRegistration(): Promise<RegisteredEditorProject> {
  monkeyBallRegistration ??= readFile(monkeyBallArchetypes, 'utf8').then((source) => {
    const library = parseData(archetypeLibraryKind, source, monkeyBallArchetypes)
    return registerEditorProject({
      project: monkeyBallProjectDefinition,
      prefabs: [],
      evaluation: {
        evaluate: (snapshot, options) => evaluateMonkeyBallProject(snapshot, library, options)
      }
    })
  })
  return monkeyBallRegistration
}

const pulsebreakRegistration = registerEditorProject({
  project: pulsebreakProjectDefinition,
  prefabs: [],
  evaluation: { evaluate: evaluatePulsebreakProject }
})

/** Resolve the project game ID to a browser-free editor registration. */
export async function loadProjectRegistration(gameId: string): Promise<RegisteredEditorProject> {
  switch (gameId) {
    case 'monkey-ball': return loadMonkeyBallRegistration()
    case 'pulsebreak': return pulsebreakRegistration
    default:
      throw new Error(
        `Unknown project gameId "${gameId}". Available: ${PROJECT_GAME_IDS.join(', ')}`
      )
  }
}
