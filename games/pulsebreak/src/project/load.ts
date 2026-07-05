import { loadProjectFiles, validateProject, type ProjectFileReader } from '@automata/project'
import { pulsebreakProjectDefinition } from './definition'
import type { PulsebreakCompiledProject } from './types'

/**
 * Runtime-safe loader: read a project folder, assert it is a Pulsebreak project,
 * validate it, and return the compiled config. Throws with every error issue's
 * code/path so boot failures are diagnosable.
 */
export async function loadPulsebreakProject(reader: ProjectFileReader): Promise<PulsebreakCompiledProject> {
  const { snapshot } = await loadProjectFiles(reader, { migrate: pulsebreakProjectDefinition.migrate })
  if (snapshot.manifest.gameId !== 'pulsebreak') {
    throw new Error(`Expected a Pulsebreak project, got gameId "${snapshot.manifest.gameId}"`)
  }
  const errors = validateProject(pulsebreakProjectDefinition, snapshot).filter((issue) => issue.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Invalid Pulsebreak project:\n${errors.map((issue) => `  ${issue.code} ${issue.pointer ?? ''}`.trimEnd()).join('\n')}`)
  }
  return pulsebreakProjectDefinition.compile(snapshot)
}
