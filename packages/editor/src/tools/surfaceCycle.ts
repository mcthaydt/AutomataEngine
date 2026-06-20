import type { Surface } from '../model/types'

const same = (a: Surface, b: Surface): boolean => {
  if (a.kind === 'color' && b.kind === 'color') return a.value === b.value
  if (a.kind === 'texture' && b.kind === 'texture') return a.textureId === b.textureId
  return false
}

export function nextSurface(palette: Surface[], current: Surface): Surface {
  const index = palette.findIndex((surface) => same(surface, current))
  return palette[(index + 1) % palette.length] ?? palette[0]!
}
