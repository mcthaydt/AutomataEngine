import { isSafeProjectPath, loadProjectFiles, projectFileDocuments, PROJECT_MANIFEST_PATH } from '@automata/project'
import { exportProjectBundle, importProjectBundle } from './bundle'
import type { ProjectSaveResult, ProjectStoragePort, ProjectStorageValidation } from './port'

/**
 * Folder-backed project storage over structural File System Access handles.
 *
 * Save ordering is deliberate and durable: new/changed scene & resource files
 * write first, the manifest writes only after referenced files succeed, and
 * orphan deletion runs last. A write failure aborts before the manifest and
 * orphan steps so the on-disk manifest never points at a half-written file.
 * Path traversal is rejected before any handle is touched.
 */
export interface WritableLike {
  write(text: string): Promise<void>
  close(): Promise<void>
}

export interface FileHandleLike {
  createWritable(): Promise<WritableLike>
  getFile(): Promise<{ text(): Promise<string> }>
}

export interface FileSystemHandleLike {
  kind: 'file' | 'directory'
  name: string
}

export interface DirectoryHandleLike {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
  entries(): AsyncIterableIterator<[string, FileSystemHandleLike]>
}

const PROJECT_SUBDIRS = ['scenes', 'resources'] as const

export function createFileSystemProjectStorage(directory: DirectoryHandleLike, options: ProjectStorageValidation = {}): ProjectStoragePort {
  return {
    capabilities: { canSaveFolder: true, canExportBundle: true },
    async open() {
      return (await loadProjectFiles({ readText: (path) => readFile(directory, path) })).snapshot
    },
    async save(snapshot, dirtyPaths): Promise<ProjectSaveResult> {
      const docs = new Map(projectFileDocuments(snapshot).map((doc) => [doc.path, doc.text]))
      const saved: string[] = []
      const failed: Array<{ path: string; message: string }> = []

      // Phase 1: dirty scene/resource files (everything except the manifest).
      for (const path of dirtyPaths) {
        if (path === PROJECT_MANIFEST_PATH) continue
        if (!isSafeProjectPath(path)) {
          failed.push({ path, message: 'unsafe path' })
          continue
        }
        const text = docs.get(path)
        if (text === undefined) {
          failed.push({ path, message: 'no document for path' })
          continue
        }
        try {
          await writeFile(directory, path, text)
          saved.push(path)
        } catch (error) {
          failed.push({ path, message: messageOf(error) })
        }
      }
      // A failed referenced file must not be followed by a manifest pointing at it.
      if (failed.length > 0) return { saved, failed }

      // Phase 2: manifest, only after referenced files are durable.
      if (dirtyPaths.includes(PROJECT_MANIFEST_PATH)) {
        try {
          await writeFile(directory, PROJECT_MANIFEST_PATH, docs.get(PROJECT_MANIFEST_PATH)!)
          saved.push(PROJECT_MANIFEST_PATH)
        } catch (error) {
          failed.push({ path: PROJECT_MANIFEST_PATH, message: messageOf(error) })
          return { saved, failed }
        }
      }

      // Phase 3: orphan deletion (files no longer in the manifest).
      await deleteOrphans(directory, new Set(docs.keys()))
      return { saved, failed }
    },
    exportBundle(snapshot) { return exportProjectBundle(snapshot, options) },
    importBundle(text) { return importProjectBundle(text).snapshot }
  }
}

async function navigate(directory: DirectoryHandleLike, path: string, create: boolean): Promise<FileHandleLike> {
  const segments = path.split('/')
  let current = directory
  for (const segment of segments.slice(0, -1)) {
    current = await current.getDirectoryHandle(segment, { create })
  }
  return current.getFileHandle(segments[segments.length - 1]!, { create })
}

async function writeFile(directory: DirectoryHandleLike, path: string, text: string): Promise<void> {
  const handle = await navigate(directory, path, true)
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

async function readFile(directory: DirectoryHandleLike, path: string): Promise<string> {
  const handle = await navigate(directory, path, false)
  const file = await handle.getFile()
  return file.text()
}

async function deleteOrphans(directory: DirectoryHandleLike, keep: ReadonlySet<string>): Promise<void> {
  for (const sub of PROJECT_SUBDIRS) {
    let subdir: DirectoryHandleLike
    try {
      subdir = await directory.getDirectoryHandle(sub)
    } catch {
      continue
    }
    const remove: string[] = []
    for await (const [name, handle] of subdir.entries()) {
      if (handle.kind === 'file' && !keep.has(`${sub}/${name}`)) remove.push(name)
    }
    for (const name of remove) await subdir.removeEntry(name)
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
