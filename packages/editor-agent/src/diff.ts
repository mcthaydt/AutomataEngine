import type { ComponentInstance, EntityDocument, ProjectSnapshot, SceneDocument } from '@automata/project'

export interface ProjectChange {
  id: string
  kind: 'added' | 'removed' | 'modified'
  /** Stable, game-neutral identifier rendered in proposal previews. */
  label: string
}

export interface ProjectDiff {
  changes: ProjectChange[]
  addedCount: number
  removedCount: number
  modifiedCount: number
}

/** Compare JSON-shaped values without depending on object insertion order. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) &&
      a.length === b.length && a.every((value, index) => valuesEqual(value, b[index]))
  }
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(left[key], right[key]))
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

/** True when the elements common to both lists appear in a different relative order. */
function orderChanged(before: readonly { id: string }[], after: readonly { id: string }[]): boolean {
  const afterIds = new Set(after.map((item) => item.id))
  const beforeIds = new Set(before.map((item) => item.id))
  const beforeCommon = before.filter((item) => afterIds.has(item.id)).map((item) => item.id)
  const afterCommon = after.filter((item) => beforeIds.has(item.id)).map((item) => item.id)
  return beforeCommon.some((id, index) => id !== afterCommon[index])
}

function entityProperties(entity: EntityDocument): unknown {
  return {
    id: entity.id,
    name: entity.name,
    parentId: entity.parentId,
    enabled: entity.enabled
  }
}

function sceneProperties(scene: SceneDocument): unknown {
  return { id: scene.id, name: scene.name }
}

function manifestProperties(snapshot: ProjectSnapshot): unknown {
  const { manifest } = snapshot
  return {
    formatVersion: manifest.formatVersion,
    id: manifest.id,
    name: manifest.name,
    gameId: manifest.gameId,
    entrySceneId: manifest.entrySceneId,
    // The scene/resource path index is part of the manifest: a path edit or reorder is a real
    // change even when the documents themselves are untouched.
    scenes: manifest.scenes,
    resources: manifest.resources
  }
}

function compareComponents(
  before: EntityDocument,
  after: EntityDocument,
  changes: ProjectChange[]
): void {
  const previous = byId(before.components)
  const next = byId(after.components)
  const label = (component: ComponentInstance) => `component:${after.id}/${component.typeId}`

  for (const component of next.values()) {
    const old = previous.get(component.id)
    if (!old) changes.push({ id: component.id, kind: 'added', label: label(component) })
    else if (!valuesEqual(old, component)) {
      changes.push({ id: component.id, kind: 'modified', label: label(component) })
    }
  }
  for (const component of previous.values()) {
    if (!next.has(component.id)) {
      changes.push({ id: component.id, kind: 'removed', label: `component:${before.id}/${component.typeId}` })
    }
  }
}

function compareEntities(before: SceneDocument, after: SceneDocument, changes: ProjectChange[]): void {
  const previous = byId(before.entities)
  const next = byId(after.entities)

  for (const entity of next.values()) {
    const old = previous.get(entity.id)
    const label = `entity:${after.id}/${entity.id}`
    if (!old) {
      changes.push({ id: entity.id, kind: 'added', label })
      continue
    }
    if (!valuesEqual(entityProperties(old), entityProperties(entity)) || orderChanged(old.components, entity.components)) {
      changes.push({ id: entity.id, kind: 'modified', label })
    }
    compareComponents(old, entity, changes)
  }
  for (const entity of previous.values()) {
    if (!next.has(entity.id)) {
      changes.push({ id: entity.id, kind: 'removed', label: `entity:${before.id}/${entity.id}` })
    }
  }
}

function compareScenes(before: ProjectSnapshot, after: ProjectSnapshot, changes: ProjectChange[]): void {
  const previous = byId(Object.values(before.scenes))
  const next = byId(Object.values(after.scenes))

  for (const scene of next.values()) {
    const old = previous.get(scene.id)
    const label = `scene:${scene.id}`
    if (!old) {
      changes.push({ id: scene.id, kind: 'added', label })
      continue
    }
    if (!valuesEqual(sceneProperties(old), sceneProperties(scene)) || orderChanged(old.entities, scene.entities)) {
      changes.push({ id: scene.id, kind: 'modified', label })
    }
    compareEntities(old, scene, changes)
  }
  for (const scene of previous.values()) {
    if (!next.has(scene.id)) changes.push({ id: scene.id, kind: 'removed', label: `scene:${scene.id}` })
  }
}

function compareResources(before: ProjectSnapshot, after: ProjectSnapshot, changes: ProjectChange[]): void {
  const previous = byId(Object.values(before.resources))
  const next = byId(Object.values(after.resources))
  for (const resource of next.values()) {
    const old = previous.get(resource.id)
    const label = `resource:${resource.id}`
    if (!old) changes.push({ id: resource.id, kind: 'added', label })
    else if (!valuesEqual(old, resource)) changes.push({ id: resource.id, kind: 'modified', label })
  }
  for (const resource of previous.values()) {
    if (!next.has(resource.id)) {
      changes.push({ id: resource.id, kind: 'removed', label: `resource:${resource.id}` })
    }
  }
}

/** Diff canonical project structures by stable IDs, independent of map iteration order. */
export function diffProjects(before: ProjectSnapshot, after: ProjectSnapshot): ProjectDiff {
  const changes: ProjectChange[] = []
  if (!valuesEqual(manifestProperties(before), manifestProperties(after))) {
    changes.push({ id: after.manifest.id, kind: 'modified', label: `project:${after.manifest.id}` })
  }

  compareScenes(before, after, changes)
  compareResources(before, after, changes)
  changes.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind))

  return {
    changes,
    addedCount: changes.filter((change) => change.kind === 'added').length,
    removedCount: changes.filter((change) => change.kind === 'removed').length,
    modifiedCount: changes.filter((change) => change.kind === 'modified').length
  }
}
