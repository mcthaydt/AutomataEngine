import type { GameDefinition } from '../model/gameDefinition'
import type { SceneItem } from '../model/types'
import { buildDrawModel } from './draw'
import type { MapView, ScreenSize } from './projection'

export function hitTestMap<Doc>(
  definition: GameDefinition<Doc>,
  items: SceneItem[],
  view: MapView,
  size: ScreenSize,
  screen: { x: number; y: number }
): string | null {
  const ops = buildDrawModel(definition, items, [], view, size)
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i]!
    if (op.shape === 'rect') {
      if (
        screen.x >= op.x &&
        screen.x <= op.x + op.w! &&
        screen.y >= op.y &&
        screen.y <= op.y + op.h!
      ) return op.id
    } else if (Math.hypot(screen.x - op.x, screen.y - op.y) <= op.r!) {
      return op.id
    }
  }
  return null
}
