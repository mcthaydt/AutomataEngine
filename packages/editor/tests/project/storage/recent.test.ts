import { describe, expect, it, vi } from 'vitest'
import { createRecentProjects } from '../../../src/project/storage/recent'
import type { DirectoryHandleLike } from '../../../src/project/storage/fileSystem'

/** A minimal in-memory IDBFactory fake covering open/put/get/getAll/delete. */
function fakeIndexedDB(): IDBFactory {
  const data = new Map<string, Map<string, Map<string, unknown>>>()
  const request = <T>(result: T) => {
    const req = { result, onsuccess: null as null | (() => void), onerror: null as null | (() => void) }
    queueMicrotask(() => req.onsuccess?.())
    return req as unknown as IDBRequest<T>
  }
  const storeApi = (map: Map<string, unknown>) => ({
    put(entry: { projectId: string }) { map.set(entry.projectId, entry); return request<IDBValidKey>(entry.projectId) },
    get(key: string) { return request(map.get(key)) },
    getAll() { return request([...map.values()]) },
    delete(key: string) { map.delete(key); return request(undefined) }
  })
  const factory = {
    open(name: string) {
      const fresh = !data.has(name)
      if (fresh) data.set(name, new Map())
      const stores = data.get(name)!
      const db = {
        createObjectStore(storeName: string) { stores.set(storeName, new Map<string, unknown>()); return {} },
        transaction(storeName: string) { return { objectStore: () => storeApi(stores.get(storeName) ?? new Map<string, unknown>()) } },
        close() {}
      }
      const req = { result: db, onsuccess: null as null | (() => void), onerror: null, onupgradeneeded: null as null | (() => void) }
      queueMicrotask(() => { if (fresh) req.onupgradeneeded?.(); req.onsuccess?.() })
      return req as unknown as IDBOpenDBRequest
    }
  }
  return factory as unknown as IDBFactory
}

const handle = (name: string): DirectoryHandleLike => ({ kind: 'directory', name } as unknown as DirectoryHandleLike)

describe('recent project handles', () => {
  it('puts, lists by recency, gets, and deletes', async () => {
    const recent = createRecentProjects(fakeIndexedDB(), { query: async () => 'granted', request: async () => 'granted' })
    await recent.put({ projectId: 'a', name: 'A', handle: handle('a'), savedAt: 1 })
    await recent.put({ projectId: 'b', name: 'B', handle: handle('b'), savedAt: 3 })
    await recent.put({ projectId: 'c', name: 'C', handle: handle('c'), savedAt: 2 })

    expect((await recent.list()).map((meta) => meta.projectId)).toEqual(['b', 'c', 'a'])
    expect(((await recent.get('b')) as unknown as { name: string }).name).toBe('b')
    await recent.delete('b')
    expect(await recent.get('b')).toBeNull()
  })

  it('requests permission on prompt and drops denied/stale handles', async () => {
    const request = vi.fn(async () => 'denied' as const)
    const recent = createRecentProjects(fakeIndexedDB(), { query: async () => 'prompt', request })
    await recent.put({ projectId: 'p', name: 'P', handle: handle('p'), savedAt: 1 })
    expect(await recent.get('p')).toBeNull()
    expect(request).toHaveBeenCalled()
    expect(await recent.list()).toEqual([])
  })
})
