import { fetchTextViaFetch } from '@automata/engine'

/** Reads project files and other same-app assets. */
export interface ProjectReader {
  /** A project-relative file (e.g. `scenes/a.scene.json`) under `project/`. */
  readText(path: string): Promise<string>
  /** Any same-app asset URL (e.g. `data/archetypes/standard.yaml`). */
  fetchText(url: string): Promise<string>
}

export interface ProjectReaderOptions {
  fetchImpl?: typeof fetch
  baseURI?: string
}

/**
 * Fetches project files and app assets, resolving every path against
 * `document.baseURI` so a game works under any deploy base, not just the origin
 * root. `readText` prepends `project/`; `fetchText` is the escape hatch for
 * non-project assets (e.g. a code-owned archetype library).
 */
export function createProjectReader(options: ProjectReaderOptions = {}): ProjectReader {
  const base = options.baseURI ?? document.baseURI
  const fetchText = fetchTextViaFetch(options.fetchImpl)
  const resolve = (relative: string): string => new URL(relative, base).href
  return {
    fetchText: (url) => fetchText(resolve(url)),
    readText: (path) => fetchText(resolve(`project/${path}`))
  }
}
