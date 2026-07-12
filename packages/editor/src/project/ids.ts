import type { SceneDocument } from '@automata/project'

/** Lowest-suffixed entity ID (`base-1`, `base-2`, …) absent from `scene`. */
export function uniqueEntityId(scene: SceneDocument, base: string): string {
  const taken = new Set(scene.entities.map((entity) => entity.id))
  let suffix = 1
  let id = `${base}-${suffix}`
  while (taken.has(id)) id = `${base}-${++suffix}`
  return id
}

/** Component ID absent from `existing`: the bare `base`, then `base-2`, `base-3`, …. */
export function uniqueComponentId(existing: readonly string[], base: string): string {
  const taken = new Set(existing)
  let id = base
  let suffix = 1
  while (taken.has(id)) id = `${base}-${++suffix}`
  return id
}
