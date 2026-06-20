import type { StoragePort } from '@automata/engine'
import type { GameDefinition } from '../model/gameDefinition'
import type { EditorStore } from '../state/store'

export const AUTOSAVE_VERSION = 1

export function installAutosave<Doc>(
  store: EditorStore<Doc>,
  _definition: GameDefinition<Doc>,
  storage: StoragePort,
  opts: { key: string; debounceMs: number }
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const unsubscribe = store.subscribe(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      storage.set(opts.key, JSON.stringify({ version: AUTOSAVE_VERSION, doc: store.getState().document.doc }))
    }, opts.debounceMs)
  })

  return () => {
    if (timer) clearTimeout(timer)
    unsubscribe()
  }
}

export function loadAutosave<Doc>(
  definition: GameDefinition<Doc>,
  storage: StoragePort,
  key: string
): Doc | null {
  const raw = storage.get(key)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { version?: number; doc?: unknown }
    if (parsed.version !== AUTOSAVE_VERSION) return null
    return definition.scene.parse(parsed.doc)
  } catch {
    return null
  }
}
