import type { Surface } from '../model/types'

const same = (a: Surface, b: Surface): boolean =>
  a.kind === b.kind && (a.kind === 'color' ? a.value === (b as { value: string }).value : true)

export function nextSurface(palette: Surface[], current: Surface): Surface {
  const index = palette.findIndex((surface) => same(surface, current))
  return palette[(index + 1) % palette.length] ?? palette[0]!
}
