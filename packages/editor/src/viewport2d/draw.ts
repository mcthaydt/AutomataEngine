import type { GameDefinition } from '../model/gameDefinition'
import type { SceneItem } from '../model/types'
import { worldToScreen, type MapView, type ScreenSize } from './projection'
import type { DrawOp } from './projectDraw'

// The shared draw-op shape now lives with the generic project draw model; the
// legacy painter and tests still import `DrawOp` from here.
export type { DrawOp }

export function buildDrawModel<Doc>(
  definition: GameDefinition<Doc>,
  items: SceneItem[],
  selection: string[],
  view: MapView,
  size: ScreenSize
): DrawOp[] {
  const selected = new Set(selection)
  const pixelsPerUnit = view.pixelsPerUnit
  return items.map((item) => {
    const center = worldToScreen(view, item.transform.position, size)
    const color = definition.resolveSurface(item.surface).color
    const base = { id: item.id, x: center.x, y: center.y, color, selected: selected.has(item.id) }

    if (item.shape.type === 'box') {
      const w = item.shape.size.x * pixelsPerUnit
      const h = item.shape.size.z * pixelsPerUnit
      return { ...base, shape: 'rect', w, h, x: center.x - w / 2, y: center.y - h / 2 }
    }

    if (item.shape.type === 'cylinder') {
      return { ...base, shape: 'circle', r: item.shape.radius * pixelsPerUnit }
    }

    return { ...base, shape: 'icon', r: 8 }
  })
}
