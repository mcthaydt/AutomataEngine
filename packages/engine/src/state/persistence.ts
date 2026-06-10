import type { StoragePort } from '../storage/port'

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
