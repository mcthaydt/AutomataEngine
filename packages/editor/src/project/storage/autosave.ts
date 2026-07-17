import type { StoragePort } from '@automata/engine'
import { parseProjectBundle, stringifyProjectBundle, toProjectBundle, type ProjectSnapshot } from '@automata/project'
import type { ProjectEditorStore } from '../store'

/**
 * Debounced autosave of the live snapshot as canonical bundle text, keyed per
 * project. Loads ride the same migration pipeline as every other parse path;
 * an unreadable autosave yields null so a stale crash-recovery cache never
 * blocks opening the real project.
 */
export function projectAutosaveKey(projectId: string): string {
  return `automata/project-autosave/${projectId}`
}

/** A disposable autosave subscription that can flush its debounce without stopping future saves. */
export interface ProjectAutosaveSubscription {
  (): void
  flush(): void
}

export function installProjectAutosave(
  store: ProjectEditorStore,
  storage: StoragePort,
  opts: { debounceMs: number }
): ProjectAutosaveSubscription {
  let timer: ReturnType<typeof setTimeout> | null = null
  const write = (): void => {
    timer = null
    const snapshot = store.getState().snapshot
    storage.set(projectAutosaveKey(snapshot.manifest.id), stringifyProjectBundle(toProjectBundle(snapshot)))
  }
  const unsubscribe = store.subscribe((state, prev) => {
    if (state.snapshot === prev.snapshot) return // only the snapshot is persisted; ignore UI/no-op changes
    if (timer) clearTimeout(timer)
    timer = setTimeout(write, opts.debounceMs)
  })
  const flush = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
      write()
    }
  }
  const dispose = (): void => {
    flush()
    unsubscribe()
  }
  return Object.assign(dispose, { flush })
}

export function loadProjectAutosave(storage: StoragePort, projectId: string): ProjectSnapshot | null {
  const raw = storage.get(projectAutosaveKey(projectId))
  if (!raw) return null
  try {
    return parseProjectBundle(raw).snapshot
  } catch {
    return null
  }
}
