import type { StoragePort } from './port'

export function memoryStorage(): StoragePort {
  const map = new Map<string, string>()
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => { map.set(key, value) }
  }
}

function readGlobalLocalStorage(): Storage | null {
  try { return globalThis.localStorage } catch { return null }
}

export function localStorageAdapter(backing?: Storage): StoragePort {
  const storage = backing ?? readGlobalLocalStorage()
  return {
    get(key) {
      if (!storage) return null
      try { return storage.getItem(key) } catch { return null }
    },
    set(key, value) {
      if (!storage) return
      try { storage.setItem(key, value) } catch { /* quota/private mode: drop write */ }
    }
  }
}
