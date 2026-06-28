import { loadProjectFiles, projectFileDocuments, type ProjectSnapshot } from '@automata/project'
import { exportProjectBundle, importProjectBundle } from './bundle'
import type { ProjectSaveResult, ProjectStoragePort, ProjectStorageValidation } from './port'

/**
 * In-memory project storage backed by a `path -> text` map. Useful for tests and
 * as the default before a folder is opened. `failPaths` simulates per-path write
 * failures so callers can verify that the store keeps failed documents dirty.
 */
export interface MemoryProjectStorageOptions extends ProjectStorageValidation {
  failPaths?: ReadonlySet<string>
}

export function createMemoryProjectStorage(initial: ProjectSnapshot, options: MemoryProjectStorageOptions = {}): ProjectStoragePort {
  const files = new Map<string, string>(projectFileDocuments(initial).map((doc) => [doc.path, doc.text]))

  return {
    capabilities: { canSaveFolder: true, canExportBundle: true },
    async open() {
      return loadProjectFiles({
        readText: async (path) => {
          const text = files.get(path)
          if (text === undefined) throw new Error(`missing ${path}`)
          return text
        }
      })
    },
    async save(snapshot, dirtyPaths): Promise<ProjectSaveResult> {
      const docs = new Map(projectFileDocuments(snapshot).map((doc) => [doc.path, doc.text]))
      const saved: string[] = []
      const failed: Array<{ path: string; message: string }> = []
      for (const path of dirtyPaths) {
        if (options.failPaths?.has(path)) {
          failed.push({ path, message: 'simulated write failure' })
          continue
        }
        const text = docs.get(path)
        if (text === undefined) {
          failed.push({ path, message: 'no document for path' })
          continue
        }
        files.set(path, text)
        saved.push(path)
      }
      return { saved, failed }
    },
    exportBundle(snapshot) { return exportProjectBundle(snapshot, options) },
    importBundle(text) { return importProjectBundle(text) }
  }
}
