/**
 * Canonical JSON for stable hashing: sort object keys deeply while preserving
 * array order because beats, milestones, and locations are ordered content.
 */
export function normalizeGameSpec<T>(value: T): T {
  return sortKeysDeep(value) as T
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortKeysDeep(record[key])]))
  }
  return value
}
