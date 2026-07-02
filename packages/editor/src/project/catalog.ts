import type { EditorProjectRegistration, RegisteredEditorProject } from './registration'

/**
 * Convention-driven registry core.
 *
 * A game participates in the editor/MCP registry by exposing async loader
 * entry points (`loadEditorRegistration` in `src/project/editor.ts`,
 * `loadHeadlessRegistration` in `src/project/index.ts`). Discovery is
 * consumer-specific — the browser editor globs game modules, the MCP server
 * scans package exports — while the loader convention, module shape checks,
 * and catalog policy live here so both consumers share one behavior.
 */

/** Host-supplied reader for registrations with code-owned data files. Paths are relative to the game's `public/` directory. */
export interface RegistrationDeps {
  readText(path: string): Promise<string>
}

/** The loader a game exports from its editor/headless project entry modules. */
export type EditorRegistrationLoader = (deps: RegistrationDeps) => Promise<EditorProjectRegistration<unknown>>

/** Stable, game-ID keyed lookup over registered projects. */
export interface ProjectCatalog {
  list(): RegisteredEditorProject[]
  get(gameId: string): RegisteredEditorProject | undefined
}

/** Assert a discovered module exposes the conventional loader export and return it. */
export function resolveRegistrationLoader(module: unknown, exportName: string, modulePath: string): EditorRegistrationLoader {
  const loader = module && typeof module === 'object'
    ? (module as Record<string, unknown>)[exportName]
    : undefined
  if (typeof loader !== 'function') {
    throw new Error(`Project registry: expected a ${exportName} function export in ${modulePath}`)
  }
  return loader as EditorRegistrationLoader
}

/** Wrap registrations in stable, duplicate-checked catalog lookup. */
export function createProjectCatalog(registrations: RegisteredEditorProject[]): ProjectCatalog {
  const byGameId = new Map<string, RegisteredEditorProject>()
  for (const registration of registrations) {
    if (byGameId.has(registration.gameId)) {
      throw new Error(`Project registry: duplicate game ID "${registration.gameId}"`)
    }
    byGameId.set(registration.gameId, registration)
  }
  return {
    list: () => [...byGameId.values()],
    get: (gameId) => byGameId.get(gameId)
  }
}
