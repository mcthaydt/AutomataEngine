import type { InputSource, InputVector } from './types'
import { clampToUnit } from './vector'

export function mergeInputs(sources: InputSource[]): InputVector {
  let x = 0, y = 0
  for (const source of sources) {
    const v = source.read()
    x += v.x
    y += v.y
  }
  return clampToUnit(x, y)
}
