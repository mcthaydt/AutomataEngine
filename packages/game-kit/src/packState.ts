/**
 * Shared world-state slice registry (pack contract v2). Packs contribute
 * named slices; the registering pack is the sole writer, any pack may read.
 * Ownership is declared in the pack's compatibility block and enforced here —
 * cross-pack reads go through the registry, never through pack imports.
 */
export interface PackStateRegistry {
  register(sliceId: string, ownerPackId: string, initial: unknown): void
  has(sliceId: string): boolean
  get(sliceId: string): unknown
  set(sliceId: string, writerPackId: string, value: unknown): void
  /** Every slice keyed by slice id (persistence and diagnostics). */
  snapshot(): Record<string, unknown>
}

export function createPackStateRegistry(): PackStateRegistry {
  const slices = new Map<string, { owner: string; value: unknown }>()
  const require = (sliceId: string): { owner: string; value: unknown } => {
    const slice = slices.get(sliceId)
    if (!slice) throw new Error(`Unknown state slice "${sliceId}"`)
    return slice
  }
  return {
    register(sliceId, ownerPackId, initial) {
      const existing = slices.get(sliceId)
      if (existing) throw new Error(`State slice "${sliceId}" already owned by "${existing.owner}"`)
      slices.set(sliceId, { owner: ownerPackId, value: initial })
    },
    has: (sliceId) => slices.has(sliceId),
    get: (sliceId) => require(sliceId).value,
    set(sliceId, writerPackId, value) {
      const slice = require(sliceId)
      if (slice.owner !== writerPackId) {
        throw new Error(`Pack "${writerPackId}" cannot write slice "${sliceId}" owned by "${slice.owner}"`)
      }
      slice.value = value
    },
    snapshot: () => Object.fromEntries([...slices].map(([id, slice]) => [id, slice.value]))
  }
}
