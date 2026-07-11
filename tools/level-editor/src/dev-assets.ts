import { resolve, sep } from 'node:path'

/**
 * Resolve a `/games/<id>/public/<rest>` dev request to an absolute file path
 * under `<repoRoot>/games/<id>/public`, or null when the URL is not a
 * game-scoped public asset or would escape that directory.
 */
export function resolveGameAssetPath(repoRoot: string, urlPath: string): string | null {
  const pathname = urlPath.split('?')[0]!
  const match = /^\/games\/([^/]+)\/public\/(.+)$/.exec(pathname)
  if (!match) return null
  const publicRoot = resolve(repoRoot, 'games', match[1]!, 'public')
  const filePath = resolve(publicRoot, match[2]!)
  if (filePath !== publicRoot && !filePath.startsWith(publicRoot + sep)) return null
  return filePath
}
