import { loadProjectFiles, validateProject, type ProjectFileReader } from '@automata/project'
import { projectDefinition } from './definition'
import type { CompiledProject } from './types'

/**
 * Runtime-safe loader: read a project folder, assert it belongs to this game,
 * validate it, and return the compiled config. Throws with every error issue's
 * code/path so boot failures are diagnosable.
 */
export async function loadProject(reader: ProjectFileReader): Promise<CompiledProject> {
  const { snapshot } = await loadProjectFiles(reader, { migrate: projectDefinition.migrate })
  if (snapshot.manifest.gameId !== 'first-light') {
    throw new Error(`Expected a First Light project, got gameId "${snapshot.manifest.gameId}"`)
  }
  const errors = validateProject(projectDefinition, snapshot).filter((issue) => issue.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Invalid First Light project:\n${errors.map((issue) => `  ${issue.code} ${issue.pointer ?? ''}`.trimEnd()).join('\n')}`)
  }
  return projectDefinition.compile(snapshot)
}
