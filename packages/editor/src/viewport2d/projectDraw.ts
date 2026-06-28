import type { SpatialItem } from '../project/spatial'
import { worldToScreen, type MapView, type ScreenSize } from './projection'

/**
 * One immutable 2D paint instruction. This is the single shared `DrawOp` type
 * (the legacy `viewport2d/draw` re-exports it). `gizmo` lets the painter render
 * translucent zone/point markers without any game knowledge.
 */
export interface DrawOp {
  id: string
  shape: 'rect' | 'circle' | 'icon'
  x: number
  y: number
  w?: number
  h?: number
  r?: number
  color: string
  selected: boolean
  gizmo?: boolean
}

/** Build the top-down 2D draw model directly from spatial items (no game branching). */
export function buildProjectDrawModel(
  items: readonly SpatialItem[],
  selection: Iterable<string>,
  view: MapView,
  size: ScreenSize
): DrawOp[] {
  const selected = new Set(selection)
  const ppu = view.pixelsPerUnit
  return items.map((item) => {
    const center = worldToScreen(view, item.position, size)
    const base = { id: item.entityId, color: item.color, selected: selected.has(item.entityId), gizmo: item.gizmo }
    if (item.bounds.kind === 'box') {
      const w = item.bounds.half.x * 2 * ppu
      const h = item.bounds.half.z * 2 * ppu
      return { ...base, shape: 'rect', w, h, x: center.x - w / 2, y: center.y - h / 2 }
    }
    if (item.bounds.kind === 'cylinder') {
      return { ...base, shape: 'circle', r: item.bounds.radius * ppu, x: center.x, y: center.y }
    }
    return { ...base, shape: 'icon', r: 8, x: center.x, y: center.y }
  })
}
