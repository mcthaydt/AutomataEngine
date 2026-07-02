import { archetypeLibraryKind, parseData } from '@automata/engine/data'
import type { EditorRegistrationLoader } from '@automata/editor/headless'
import { monkeyBallProjectDefinition } from './definition'
import { evaluateMonkeyBallProject } from './evaluation'

/** Public-relative location of the code-owned archetype registry. */
export const ARCHETYPE_DATA_PATH = 'data/archetypes/standard.yaml'

/**
 * Registry convention entry for Node hosts (MCP server, headless evaluation).
 * Browser-free: no preview, no `@automata/engine/browser` imports.
 */
export const loadHeadlessRegistration: EditorRegistrationLoader = async (deps) => {
  const source = await deps.readText(ARCHETYPE_DATA_PATH)
  const library = parseData(archetypeLibraryKind, source, ARCHETYPE_DATA_PATH)
  return {
    project: monkeyBallProjectDefinition,
    prefabs: [],
    evaluation: {
      evaluate: (snapshot, options) => evaluateMonkeyBallProject(snapshot, library, options)
    }
  }
}
