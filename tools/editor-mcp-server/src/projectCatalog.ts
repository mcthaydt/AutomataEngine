import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  registerEditorProject,
  resolveRegistrationLoader,
  type RegisteredEditorProject
} from '@automata/editor/headless'

/** src -> package -> tools -> repository root. */
const DEFAULT_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Convention discovery: a game participates iff its package.json exposes the
 * `./project` export (backed by `loadHeadlessRegistration`) and its package
 * name matches its directory name — that shared name is the gameId, and it is
 * how the dynamic import below resolves through workspace links.
 */
export async function discoverGames(repoRoot = DEFAULT_REPO_ROOT): Promise<string[]> {
  const entries = await readdir(resolve(repoRoot, 'games'), { withFileTypes: true })
  const ids: string[] = []
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const manifestPath = resolve(repoRoot, 'games', entry.name, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      name?: string
      exports?: Record<string, unknown>
    }
    if (!manifest.exports?.['./project']) continue
    if (manifest.name !== entry.name) {
      throw new Error(
        `Game directory "games/${entry.name}" must be published as "${entry.name}", found "${manifest.name}"`
      )
    }
    ids.push(entry.name)
  }
  return ids
}

/** Resolve a discovered game ID to a browser-free editor registration. */
export async function loadProjectRegistration(
  gameId: string,
  repoRoot = DEFAULT_REPO_ROOT
): Promise<RegisteredEditorProject> {
  const available = await discoverGames(repoRoot)
  if (!available.includes(gameId)) {
    throw new Error(`Unknown project gameId "${gameId}". Available: ${available.join(', ')}`)
  }

  const modulePath = `${gameId}/project`
  const module: unknown = await import(modulePath)
  const loader = resolveRegistrationLoader(module, 'loadHeadlessRegistration', modulePath)
  const publicDir = resolve(repoRoot, 'games', gameId, 'public')
  const registration = registerEditorProject(await loader({
    readText: (path) => readFile(resolve(publicDir, path), 'utf8')
  }))
  if (registration.gameId !== gameId) {
    throw new Error(`Game "${gameId}" registered a mismatched gameId "${registration.gameId}"`)
  }
  return registration
}
