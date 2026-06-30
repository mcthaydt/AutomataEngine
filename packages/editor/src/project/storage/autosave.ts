import type { StoragePort } from '@automata/engine'
import { projectSnapshotSchema, type ProjectSnapshot } from '@automata/project'
import type { ProjectEditorStore } from '../store'

/**
 * Debounced autosave of the live snapshot to a `StoragePort`, keyed per project.
 * The returned disposer flushes a pending write (and only a pending one) so a
 * stop never loses the last edit.
 */
export const PROJECT_AUTOSAVE_VERSION = 1

export function projectAutosaveKey(projectId: string): string {
  return `automata/project-autosave/${projectId}`
}

export function installProjectAutosave(store: ProjectEditorStore, storage: StoragePort, opts: { debounceMs: number }): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const write = (): void => {
    timer = null
    const snapshot = store.getState().snapshot
    storage.set(projectAutosaveKey(snapshot.manifest.id), JSON.stringify({ version: PROJECT_AUTOSAVE_VERSION, snapshot }))
  }
  const unsubscribe = store.subscribe((state, prev) => {
    if (state.snapshot === prev.snapshot) return // only the snapshot is persisted; ignore UI/no-op changes
    if (timer) clearTimeout(timer)
    timer = setTimeout(write, opts.debounceMs)
  })
  return () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
      write()
    }
    unsubscribe()
  }
}

export function loadProjectAutosave(storage: StoragePort, projectId: string): ProjectSnapshot | null {
  const raw = storage.get(projectAutosaveKey(projectId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { version?: number; snapshot?: unknown }
    if (parsed.version !== PROJECT_AUTOSAVE_VERSION) return null
    return projectSnapshotSchema.parse(parsed.snapshot)
  } catch {
    return null
  }
}
