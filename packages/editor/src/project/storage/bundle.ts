import { parseProjectBundle, stringifyProjectBundle, toProjectBundle, type ParsedProject, type ProjectSnapshot } from '@automata/project'
import type { ProjectBundleExport, ProjectStorageValidation } from './port'

/**
 * Single-file bundle helpers shared by storage adapters.
 *
 * Export always succeeds for a parseable snapshot and attaches the current game
 * validation issues (so work-in-progress, game-invalid projects can still be
 * shared). Import structurally validates but never silently repairs.
 */
export function exportProjectBundle(snapshot: ProjectSnapshot, options: ProjectStorageValidation = {}): ProjectBundleExport {
  return { text: stringifyProjectBundle(toProjectBundle(snapshot)), issues: options.validate?.(snapshot) ?? [] }
}

export function importProjectBundle(text: string): ParsedProject {
  return parseProjectBundle(text)
}
