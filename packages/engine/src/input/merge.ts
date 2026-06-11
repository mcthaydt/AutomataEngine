import type { InputSource, InputVector } from './types'

export function mergeInputs(sources: InputSource[]): InputVector {
  let x = 0, y = 0
  for (const source of sources) {
    const v = source.read()
    x += v.x
    y += v.y
  }
  const len = Math.hypot(x, y)
  if (len > 1) { x /= len; y /= len }
  return { x, y }
}
