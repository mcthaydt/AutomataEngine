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

/** Register every discovered game once and expose stable, game-ID based lookup. */
export async function createProjectCatalog(
  dependencies: ProjectCatalogDependencies
): Promise<ProjectCatalog> {
  // Registry loaders take public-relative paths; this host serves them at /.
  const deps = { readText: (path: string) => dependencies.readText(`/${path}`) }
  const registrations: RegisteredEditorProject[] = []
  for (const [modulePath, module] of Object.entries(editorEntryModules)) {
    const loader = resolveRegistrationLoader(module, 'loadEditorRegistration', modulePath)
    registrations.push(registerEditorProject(await loader(deps)))
  }
  return catalogFromRegistrations(registrations)
}
