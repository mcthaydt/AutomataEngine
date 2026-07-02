import type { EditorRegistrationLoader } from '@automata/editor/headless'
import { pulsebreakProjectDefinition } from './definition'
import { evaluatePulsebreakProject } from './evaluation'

export * from './types'
export { pulsebreakProjectDefinition } from './definition'
export { compilePulsebreakProject } from './compiler'
export { createPulsebreakTemplate, compilePulsebreakTemplate, defaultPulsebreakCompiledProject } from './template'
export { loadPulsebreakProject } from './load'
export { evaluatePulsebreakProject, type PulsebreakEvaluationResult } from './evaluation'

/**
 * Registry convention entry for Node hosts (MCP server, headless evaluation).
 * Pulsebreak reads no code-owned data files, so the deps reader goes unused.
 */
export const loadHeadlessRegistration: EditorRegistrationLoader = async () => ({
  project: pulsebreakProjectDefinition,
  prefabs: [],
  evaluation: { evaluate: evaluatePulsebreakProject }
})
