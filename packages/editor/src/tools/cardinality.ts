import type { GameDefinition } from '../model/gameDefinition'
import type { Brush, SceneItem } from '../model/types'

/** Every placeable brush across the geometry, archetype, and marker palettes. */
export function allBrushes<Doc>(definition: GameDefinition<Doc>): Brush[] {
  return [...definition.palette.geometry, ...definition.palette.archetypes, ...definition.palette.markers]
}

/** The brush with the given id, or null. Single source of truth for brush lookup. */
export function findBrushById<Doc>(definition: GameDefinition<Doc>, id: string): Brush | null {
  return allBrushes(definition).find((brush) => brush.id === id) ?? null
}

/** The brush that produced an item, matched by kind plus archetype/marker ref. */
export function brushOf<Doc>(definition: GameDefinition<Doc>, item: SceneItem): Brush | null {
  const ref = item.shape.type === 'archetype'
    ? item.shape.name
    : item.shape.type === 'marker' ? item.shape.markerId : undefined
  return allBrushes(definition).find(
    (brush) => brush.kind === item.kind && (brush.ref === undefined || brush.ref === ref)
  ) ?? null
}

export function countForBrush<Doc>(
  definition: GameDefinition<Doc>,
  items: SceneItem[],
  brush: Brush
): number {
  return items.filter((item) => brushOf(definition, item)?.id === brush.id).length
}

export function canPlace<Doc>(definition: GameDefinition<Doc>, items: SceneItem[], brush: Brush): boolean {
  return countForBrush(definition, items, brush) < brush.cardinality.max
}

export function canDelete<Doc>(definition: GameDefinition<Doc>, items: SceneItem[], id: string): boolean {
  const item = items.find((candidate) => candidate.id === id)
  if (!item) return false
  const brush = brushOf(definition, item)
  if (!brush) return true
  return countForBrush(definition, items, brush) > brush.cardinality.min
}

export function missingRequired<Doc>(definition: GameDefinition<Doc>, items: SceneItem[]): string[] {
  return allBrushes(definition)
    .filter((brush) => countForBrush(definition, items, brush) < brush.cardinality.min)
    .map((brush) => brush.label)
}
