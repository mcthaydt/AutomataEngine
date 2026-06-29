import { projectFileDocuments, stringifyProjectBundle, toProjectBundle } from '@automata/project'
import { registerEditorProject, type DirectoryHandleLike } from '@automata/editor'
import { pulsebreakEditorRegistration } from 'pulsebreak/editor'
import { describe, expect, it, vi } from 'vitest'
import { createBrowserWorkspace, type BrowserWorkspaceDependencies } from '../src/browserWorkspace'

const registration = registerEditorProject(pulsebreakEditorRegistration)
const snapshot = registration.createTemplate()

function fakeDirectory(): DirectoryHandleLike {
  const files = new Map(projectFileDocuments(snapshot).map((document) => [document.path, document.text]))
  const directory = (prefix: string): DirectoryHandleLike => ({
    async getDirectoryHandle(name) { return directory(`${prefix}${name}/`) },
    async getFileHandle(name) {
      const path = `${prefix}${name}`
      return {
        async createWritable() {
          return { async write(text) { files.set(path, text) }, async close() {} }
        },
        async getFile() {
          return { async text() { const value = files.get(path); if (!value) throw new Error(`missing ${path}`); return value } }
        }
      }
    },
    async removeEntry(name) { files.delete(`${prefix}${name}`) },
    async *entries() {}
  })
  return directory('')
}

/** Minimal IndexedDB implementation for the recent-handle adapter. */
function fakeIndexedDB(): IDBFactory {
  const entries = new Map<string, unknown>()
  const request = <T>(result: T): IDBRequest<T> => {
    const value = { result, onsuccess: null as null | (() => void), onerror: null }
    queueMicrotask(() => value.onsuccess?.())
    return value as unknown as IDBRequest<T>
  }
  const store = {
    put(value: { projectId: string }) { entries.set(value.projectId, value); return request<IDBValidKey>(value.projectId) },
    get(key: string) { return request(entries.get(key)) },
    getAll() { return request([...entries.values()]) },
    delete(key: string) { entries.delete(key); return request(undefined) }
  }
  return {
    open() {
      const database = {
        createObjectStore() { return store },
        transaction() { return { objectStore: () => store } },
        close() {}
      }
      const value = {
        result: database,
        onsuccess: null as null | (() => void),
        onerror: null,
        onupgradeneeded: null as null | (() => void)
      }
      queueMicrotask(() => { value.onupgradeneeded?.(); value.onsuccess?.() })
      return value as unknown as IDBOpenDBRequest
    }
  } as unknown as IDBFactory
}

function dependencies(overrides: Partial<BrowserWorkspaceDependencies> = {}): BrowserWorkspaceDependencies {
  return {
    indexedDB: fakeIndexedDB(),
    showDirectoryPicker: async () => fakeDirectory(),
    pickBundleText: async () => null,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    createObjectURL: () => 'blob:bundle',
    revokeObjectURL: () => {},
    clickDownload: () => {},
    now: () => 42,
    ...overrides
  }
}

describe('browser project workspace', () => {
  it('opens and remembers a folder, then reopens its granted recent handle', async () => {
    const workspace = createBrowserWorkspace(dependencies())

    const opened = await workspace.open(registration)

    expect(opened?.source).toBe('folder')
    expect(opened?.snapshot.manifest.gameId).toBe('pulsebreak')
    expect((await workspace.listRecent()).map((entry) => entry.projectId)).toEqual(['pulsebreak'])
    expect((await workspace.openRecent('pulsebreak', registration))?.source).toBe('recent')
  })

  it('falls back to bundle import when folder access is unavailable or denied', async () => {
    const denied = new DOMException('denied', 'NotAllowedError')
    const bundle = stringifyProjectBundle(toProjectBundle(snapshot))
    const workspace = createBrowserWorkspace(dependencies({
      showDirectoryPicker: async () => { throw denied },
      pickBundleText: async () => bundle
    }))

    const opened = await workspace.open(registration)

    expect(opened?.source).toBe('bundle')
    expect(registration.compile(opened!.snapshot)).toEqual(registration.compile(snapshot))
  })

  it('drops a recent handle when permission is denied', async () => {
    const indexedDB = fakeIndexedDB()
    const granted = createBrowserWorkspace(dependencies({ indexedDB }))
    await granted.open(registration)
    const denied = createBrowserWorkspace(dependencies({
      indexedDB,
      queryPermission: async () => 'denied'
    }))

    expect(await denied.openRecent('pulsebreak', registration)).toBeNull()
    expect(await denied.listRecent()).toEqual([])
  })

  it('revokes the temporary object URL after downloading a bundle', () => {
    const clickDownload = vi.fn()
    const revokeObjectURL = vi.fn()
    const workspace = createBrowserWorkspace(dependencies({ clickDownload, revokeObjectURL }))

    workspace.exportBundle(registration, snapshot)

    expect(clickDownload).toHaveBeenCalledWith('blob:bundle', 'pulsebreak.automata.json')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:bundle')
  })
})
