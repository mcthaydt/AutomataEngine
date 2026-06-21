import type { Vec3 } from '@automata/engine'
import { snapVec3XZ } from '../grid'
import type { GameDefinition } from '../model/gameDefinition'
import type { Brush, ItemShape, SceneCommand, SceneItem, Surface } from '../model/types'
import { canPlace } from './cardinality'

export function newItemId(brush: Brush, items: SceneItem[]): string {
  if (brush.kind === 'marker') return `marker:${brush.ref}`
  let next = items.length
  let id = `${brush.id}:${next}`
  const taken = new Set(items.map((item) => item.id))
  while (taken.has(id)) {
    next++
    id = `${brush.id}:${next}`
  }
  return id
}

function shapeFor(brush: Brush): ItemShape {
  switch (brush.kind) {
    case 'box': return { type: 'box', size: { x: 1, y: 1, z: 1 } }
    case 'cylinder': return { type: 'cylinder', radius: 0.5, height: 1 }
    case 'archetype': return { type: 'archetype', name: brush.ref ?? brush.id }
    case 'marker': return { type: 'marker', markerId: brush.ref ?? brush.id }
  }
}

const defaultSurface: Surface = { kind: 'color', value: '#7ec850' }

export function placementCommand<Doc>(
  definition: GameDefinition<Doc>,
  items: SceneItem[],
  brush: Brush,
  world: Vec3,
  cell: number
): SceneCommand | null {
  const pos = snapVec3XZ(world, cell)
  if (!canPlace(definition, items, brush) && brush.cardinality.max === 1) {
    const existing = items.find((item) => item.id === `marker:${brush.ref}`)
    if (!existing) return null
    const current = existing.transform.position
    return {
      type: 'moveSelected',
      ids: [existing.id],
      delta: { x: pos.x - current.x, y: 0, z: pos.z - current.z }
    }
  }
  if (!canPlace(definition, items, brush)) return null

  const item: SceneItem = {
    id: newItemId(brush, items),
    kind: brush.kind,
    transform: { position: pos, rotationEuler: { x: 0, y: 0, z: 0 } },
    shape: shapeFor(brush),
    surface: defaultSurface
  }
  return { type: 'addItem', item }
}
