import { registerEditorProject, type RegisteredEditorProject } from '@automata/editor'
import { loadMonkeyBallEditorRegistration } from 'monkey-ball/editor'
import { pulsebreakEditorRegistration } from 'pulsebreak/editor'

export interface ProjectCatalog {
  list(): RegisteredEditorProject[]
  get(gameId: string): RegisteredEditorProject | undefined
}

export interface ProjectCatalogDependencies {
  /** Browser or test text reader used by registrations with code-owned data. */
  readText(path: string): Promise<string>
}

/** Register every shipped game once and expose stable, game-ID based lookup. */
export async function createProjectCatalog(
  dependencies: ProjectCatalogDependencies
): Promise<ProjectCatalog> {
  const registrations = [
    // Registry loaders take public-relative paths; this host serves them at /.
    registerEditorProject(await loadMonkeyBallEditorRegistration({
      readText: (path) => dependencies.readText(`/${path}`)
    })),
    registerEditorProject(pulsebreakEditorRegistration)
  ]
  const byGameId = new Map(registrations.map((registration) => [registration.gameId, registration]))
  if (byGameId.size !== registrations.length) throw new Error('Project catalog contains duplicate game IDs')

  return {
    list: () => [...registrations],
    get: (gameId) => byGameId.get(gameId)
  }
}
