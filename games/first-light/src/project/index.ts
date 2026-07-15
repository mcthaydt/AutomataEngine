import { emptyComposition, parseCompositionManifest } from '@automata/contracts'
import type { EditorRegistrationLoader } from '@automata/editor/headless'
import { projectDefinition } from './definition'
import { evaluateProject } from './evaluation'

export { GAME_TYPE_IDS, type CompiledProject } from './types'
export { projectDefinition } from './definition'
export { compileProject } from './compiler'
export { createTemplate } from './template'
export { loadProject } from './load'
export { evaluateProject, type EvaluationResult } from './evaluation'

/**
 * Registry convention entry for Node hosts (MCP server, headless evaluation).
 * Reads composition data when present; plain scaffolds fall back to an empty
 * composition, while malformed manifests remain real errors.
 */
export const loadHeadlessRegistration: EditorRegistrationLoader = async (deps) => {
  let text: string | null = null
  try {
    text = await deps.readText('project/composition.json')
  } catch {
    text = null
  }
  const composition = text === null
    ? emptyComposition(projectDefinition.gameId)
    : parseCompositionManifest(text)
  return {
    project: projectDefinition,
    prefabs: [],
    evaluation: { evaluate: (snapshot, opts) => evaluateProject(snapshot, opts, composition) }
  }
}
