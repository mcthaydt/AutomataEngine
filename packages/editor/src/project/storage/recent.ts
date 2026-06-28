import type { DirectoryHandleLike } from './fileSystem'

/**
 * Recently-opened project folders, persisted as directory handles in IndexedDB.
 *
 * The `IDBFactory` and the permission query/request are injected so tests stay
 * deterministic (no real browser database or permission prompts). Reopening a
 * recent project re-checks permission; a denied or stale handle is dropped.
 */
export const RECENT_DB_NAME = 'automata-editor'
export const RECENT_STORE_NAME = 'project-handles'

export type PermissionState = 'granted' | 'prompt' | 'denied'

export interface RecentPermissions {
  query(handle: DirectoryHandleLike): Promise<PermissionState>
  request(handle: DirectoryHandleLike): Promise<'granted' | 'denied'>
}

export interface RecentProjectEntry {
  projectId: string
  name: string
  handle: DirectoryHandleLike
  savedAt: number
}

export interface RecentProjectMeta {
  projectId: string
  name: string
  savedAt: number
}

export interface RecentProjects {
  put(entry: RecentProjectEntry): Promise<void>
  list(): Promise<RecentProjectMeta[]>
  /** Resolve a usable handle, re-checking permission; drops stale/denied handles. */
  get(projectId: string): Promise<DirectoryHandleLike | null>
  delete(projectId: string): Promise<void>
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(RECENT_DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(RECENT_STORE_NAME, { keyPath: 'projectId' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(factory: IDBFactory, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase(factory)
  try {
    const transaction = db.transaction(RECENT_STORE_NAME, mode)
    return await promisify(run(transaction.objectStore(RECENT_STORE_NAME)))
  } finally {
    db.close()
  }
}

export function createRecentProjects(factory: IDBFactory, permissions: RecentPermissions): RecentProjects {
  const remove = (projectId: string): Promise<void> =>
    withStore<undefined>(factory, 'readwrite', (store) => store.delete(projectId) as IDBRequest<undefined>).then(() => undefined)

  return {
    async put(entry) {
      await withStore<IDBValidKey>(factory, 'readwrite', (store) => store.put(entry))
    },
    async list() {
      const entries = await withStore<RecentProjectEntry[]>(factory, 'readonly', (store) => store.getAll() as IDBRequest<RecentProjectEntry[]>)
      return entries
        .map((entry) => ({ projectId: entry.projectId, name: entry.name, savedAt: entry.savedAt }))
        .sort((a, b) => b.savedAt - a.savedAt)
    },
    async get(projectId) {
      const entry = await withStore<RecentProjectEntry | undefined>(factory, 'readonly', (store) => store.get(projectId) as IDBRequest<RecentProjectEntry | undefined>)
      if (!entry) return null
      let state = await permissions.query(entry.handle)
      if (state === 'prompt') state = await permissions.request(entry.handle)
      if (state !== 'granted') {
        await remove(projectId)
        return null
      }
      return entry.handle
    },
    delete: remove
  }
}
