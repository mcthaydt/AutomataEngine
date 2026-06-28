import { projectManifestSchema, sceneDocumentSchema, resourceDocumentSchema, projectSnapshotSchema } from './model'
import type { ProjectSnapshot, SceneDocument, ResourceDocument } from './model'

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

/** Load a project folder into a validated snapshot, manifest first. */
export async function loadProjectFiles(reader: ProjectFileReader): Promise<ProjectSnapshot> {
  const manifest = projectManifestSchema.parse(JSON.parse(await reader.readText(PROJECT_MANIFEST_PATH)))

  const scenes: Record<string, SceneDocument> = {}
  for (const entry of manifest.scenes) {
    if (!isSafeProjectPath(entry.path)) throw new Error(`Unsafe scene path "${entry.path}"`)
    const scene = sceneDocumentSchema.parse(JSON.parse(await reader.readText(entry.path)))
    if (scene.id !== entry.id) throw new Error(`Scene id mismatch: manifest "${entry.id}" vs document "${scene.id}"`)
    scenes[scene.id] = scene
  }

  const resources: Record<string, ResourceDocument> = {}
  for (const entry of manifest.resources) {
    if (!isSafeProjectPath(entry.path)) throw new Error(`Unsafe resource path "${entry.path}"`)
    const resource = resourceDocumentSchema.parse(JSON.parse(await reader.readText(entry.path)))
    if (resource.id !== entry.id) throw new Error(`Resource id mismatch: manifest "${entry.id}" vs document "${resource.id}"`)
    if (resource.typeId !== entry.typeId) throw new Error(`Resource type mismatch for "${entry.id}": manifest "${entry.typeId}" vs document "${resource.typeId}"`)
    resources[resource.id] = resource
  }

  return projectSnapshotSchema.parse({ manifest, scenes, resources })
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
