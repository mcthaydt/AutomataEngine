import type { StoragePort } from '../storage/port'
import type { AnyAction, Middleware } from './store'

interface Envelope { version: number; data: unknown }

function isEnvelope(value: unknown): value is Envelope {
  return typeof value === 'object' && value !== null &&
    typeof (value as Envelope).version === 'number' && 'data' in value
}

export function loadPersisted(
  storage: StoragePort,
  key: string,
  version: number,
  migrate?: (data: unknown, fromVersion: number) => unknown | null
): unknown | null {
  const raw = storage.get(key)
  if (raw === null) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  if (!isEnvelope(parsed)) return null
  if (parsed.version === version) return parsed.data
  if (!migrate) return null
  return migrate(parsed.data, parsed.version)
}

export interface PersistenceOptions<S> {
  key: string
  version: number
  debounceMs: number
  pick: (state: S) => unknown
}

export interface Persistence<S, A extends AnyAction> {
  middleware: Middleware<S, A>
  flush(): void
}

export function createPersistence<S, A extends AnyAction>(
  storage: StoragePort,
  options: PersistenceOptions<S>
): Persistence<S, A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: unknown = undefined
  let lastWritten: unknown = undefined

  const write = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null }
    if (pending === undefined) return
    storage.set(options.key, JSON.stringify({ version: options.version, data: pending }))
    lastWritten = pending
    pending = undefined
  }

  return {
    middleware: (api) => {
      lastWritten = options.pick(api.getState())
      return (next) => (action) => {
        next(action)
        const picked = options.pick(api.getState())
        const reference = pending === undefined ? lastWritten : pending
        if (deepEqual(picked, reference)) return
        pending = picked
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(write, options.debounceMs)
      }
    },
    flush: write
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}
