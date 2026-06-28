import type { SpatialItem } from '../project/spatial'
import { buildProjectDrawModel } from './projectDraw'
import type { MapView, ScreenSize } from './projection'

/** Pick the topmost spatial item under a 2D cursor, returning its entity ID. */
export function hitTestProjectMap(
  items: readonly SpatialItem[],
  view: MapView,
  size: ScreenSize,
  screen: { x: number; y: number }
): string | null {
  const ops = buildProjectDrawModel(items, [], view, size)
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i]!
    if (op.shape === 'rect') {
      if (screen.x >= op.x && screen.x <= op.x + op.w! && screen.y >= op.y && screen.y <= op.y + op.h!) return op.id
    } else if (Math.hypot(screen.x - op.x, screen.y - op.y) <= op.r!) {
      return op.id
    }
  }
  return null
}
