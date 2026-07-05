import { loadProjectFiles, validateProject, type ProjectFileReader } from '@automata/project'
import { monkeyBallProjectDefinition } from './definition'
import type { CompiledMonkeyBallProject } from './types'

/** Load, validate, and compile a Monkey Ball project through an injected reader. */
export async function loadMonkeyBallProject(reader: ProjectFileReader): Promise<CompiledMonkeyBallProject> {
  const { snapshot } = await loadProjectFiles(reader, { migrate: monkeyBallProjectDefinition.migrate })
  if (snapshot.manifest.gameId !== 'monkey-ball') {
    throw new Error(`Expected a Monkey Ball project, got gameId "${snapshot.manifest.gameId}"`)
  }
  const errors = validateProject(monkeyBallProjectDefinition, snapshot).filter((issue) => issue.severity === 'error')
  if (errors.length > 0) {
    const detail = errors.map((issue) => `  ${issue.code} ${issue.pointer ?? ''}`.trimEnd()).join('\n')
    throw new Error(`Invalid Monkey Ball project:\n${detail}`)
  }
  return monkeyBallProjectDefinition.compile(snapshot)
}
