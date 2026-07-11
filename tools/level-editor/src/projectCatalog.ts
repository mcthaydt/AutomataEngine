import {
  createProjectCatalog as catalogFromRegistrations,
  registerEditorProject,
  resolveRegistrationLoader,
  type ProjectCatalog,
  type RegisteredEditorProject
} from '@automata/editor'

export type { ProjectCatalog } from '@automata/editor'

export interface ProjectCatalogDependencies {
  /** Browser or test text reader used by registrations with code-owned data. */
  readText(path: string): Promise<string>
}

/**
 * Convention discovery: any game exposing `src/project/editor.ts` with a
 * `loadEditorRegistration` export appears in the chooser — no per-game wiring.
 * Eager so every registration failure surfaces at startup, not first click.
 */
const editorEntryModules = import.meta.glob('../../../games/*/src/project/editor.ts', { eager: true })

/** Extract the game id from a discovered `games/<id>/src/project/editor.ts` path. */
export function gameIdFromEntryModule(modulePath: string): string {
  const match = /\/games\/([^/]+)\//.exec(modulePath)
  if (!match) throw new Error(`Cannot derive game id from editor module path "${modulePath}"`)
  return match[1]!
}

/**
 * Build the dev-server URL for a game's public-relative asset. This is the exact
 * contract `src/dev-assets.ts#resolveGameAssetPath` serves; keep them in sync.
 */
export function publicReadPath(gameId: string, path: string): string {
  return `/games/${gameId}/public/${path}`
}

/** Register every discovered game once and expose stable, game-ID based lookup. */
export async function createProjectCatalog(
  dependencies: ProjectCatalogDependencies
): Promise<ProjectCatalog> {
  const registrations: RegisteredEditorProject[] = []
  for (const [modulePath, module] of Object.entries(editorEntryModules)) {
    // Registry loaders take public-relative paths; serve each game's own public tree.
    const gameId = gameIdFromEntryModule(modulePath)
    const deps = { readText: (path: string) => dependencies.readText(publicReadPath(gameId, path)) }
    const loader = resolveRegistrationLoader(module, 'loadEditorRegistration', modulePath)
    registrations.push(registerEditorProject(await loader(deps)))
  }
  return catalogFromRegistrations(registrations)
}
