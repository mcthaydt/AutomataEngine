import { parseProjectSnapshot, type GameMigrateHook, type ParsedProject, type RawProjectDocuments } from './migrate'
import type { ProjectSnapshot } from './model'

/**
 * Folder I/O for a project workspace.
 *
 * A project on disk is a manifest at a fixed path plus one file per scene and
 * resource at manifest-declared relative paths. Loading is injected through a
 * `ProjectFileReader` so tests and browser/Node hosts share one code path, and
 * every declared path is checked for traversal before it is touched.
 */

/** The fixed manifest filename at the root of a project folder. */
export const PROJECT_MANIFEST_PATH = 'automata.project.json'

/** Minimal text reader so callers can back it with fetch, fs, or a fake. */
export interface ProjectFileReader {
  readText(path: string): Promise<string>
}

/** One serialized project document plus where/what it is. */
export interface ProjectFileDocument {
  path: string
  text: string
  kind: 'manifest' | 'scene' | 'resource'
}

/** True when `path` is a safe relative POSIX path (no traversal, no absolutes). */
export function isSafeProjectPath(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.includes('\\')) return false
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Read path entries from a raw (unvalidated, possibly old-format) manifest. */
function manifestPathEntries(rawManifest: unknown, key: 'scenes' | 'resources'): string[] {
  const entries = (rawManifest as Record<string, unknown> | null | undefined)?.[key]
  if (!Array.isArray(entries)) throw new Error(`Manifest "${key}" must be an array`)
  return entries.map((entry) => {
    const path = (entry as { path?: unknown } | null)?.path
    if (typeof path !== 'string' || !isSafeProjectPath(path)) {
      throw new Error(`Unsafe ${key === 'scenes' ? 'scene' : 'resource'} path "${String(path)}"`)
    }
    return path
  })
}

/** Load a project folder through the central migration-aware parse entry. */
export async function loadProjectFiles(
  reader: ProjectFileReader,
  opts: { migrate?: GameMigrateHook } = {}
): Promise<ParsedProject> {
  const manifest: unknown = JSON.parse(await reader.readText(PROJECT_MANIFEST_PATH))
  const raw: RawProjectDocuments = { manifest, scenes: [], resources: [] }
  for (const path of manifestPathEntries(manifest, 'scenes')) {
    raw.scenes.push(JSON.parse(await reader.readText(path)))
  }
  for (const path of manifestPathEntries(manifest, 'resources')) {
    raw.resources.push(JSON.parse(await reader.readText(path)))
  }
  return parseProjectSnapshot(raw, opts)
}

/** Minimal text writer so callers can back it with fs or a fake. Mirrors ProjectFileReader. */
export interface ProjectFileWriter {
  writeText(path: string, text: string): Promise<void>
}

/** Serialize a snapshot to canonical documents and write each through the injected writer. */
export async function writeProjectFiles(writer: ProjectFileWriter, snapshot: ProjectSnapshot): Promise<void> {
  for (const doc of projectFileDocuments(snapshot)) {
    await writer.writeText(doc.path, doc.text)
  }
}

/** Serialize a snapshot into the documents to write, manifest-first then manifest order. */
export function projectFileDocuments(snapshot: ProjectSnapshot): ProjectFileDocument[] {
  const docs: ProjectFileDocument[] = [{ path: PROJECT_MANIFEST_PATH, text: canonicalJson(snapshot.manifest), kind: 'manifest' }]
  for (const entry of snapshot.manifest.scenes) {
    const scene = snapshot.scenes[entry.id]
    if (!scene) throw new Error(`Manifest references missing scene "${entry.id}"`)
    docs.push({ path: entry.path, text: canonicalJson(scene), kind: 'scene' })
  }
  for (const entry of snapshot.manifest.resources) {
    const resource = snapshot.resources[entry.id]
    if (!resource) throw new Error(`Manifest references missing resource "${entry.id}"`)
    docs.push({ path: entry.path, text: canonicalJson(resource), kind: 'resource' })
  }
  return docs
}
