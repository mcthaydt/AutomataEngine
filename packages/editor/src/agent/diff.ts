import type { GameDefinition } from '../model/gameDefinition'
import type { SceneItem } from '../model/types'

export interface ItemChange {
  id: string
  kind: 'added' | 'removed' | 'modified'
  /** The item's kind, used as a compact human-readable label. */
  label: string
}

export interface DocDiff {
  changes: ItemChange[]
  addedCount: number
  removedCount: number
  modifiedCount: number
}

function itemsEqual(a: SceneItem, b: SceneItem): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function diffDocs<Doc>(definition: GameDefinition<Doc>, before: Doc, after: Doc): DocDiff {
  const beforeItems = new Map(definition.scene.listItems(before).map((item) => [item.id, item]))
  const afterItems = new Map(definition.scene.listItems(after).map((item) => [item.id, item]))
  const changes: ItemChange[] = []

  for (const [id, item] of afterItems) {
    const prev = beforeItems.get(id)
    if (!prev) changes.push({ id, kind: 'added', label: item.kind })
    else if (!itemsEqual(prev, item)) changes.push({ id, kind: 'modified', label: item.kind })
  }
  for (const [id, item] of beforeItems) {
    if (!afterItems.has(id)) changes.push({ id, kind: 'removed', label: item.kind })
  }

  return {
    changes,
    addedCount: changes.filter((c) => c.kind === 'added').length,
    removedCount: changes.filter((c) => c.kind === 'removed').length,
    modifiedCount: changes.filter((c) => c.kind === 'modified').length
  }
}
