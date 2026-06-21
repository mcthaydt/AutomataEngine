import type { InputVector } from './types'

/** Clamps a 2D vector to the unit disc, preserving direction. |v| <= 1. */
export function clampToUnit(x: number, y: number): InputVector {
  const len = Math.hypot(x, y)
  return len > 1 ? { x: x / len, y: y / len } : { x, y }
}

/** Zero below `deadzone`; above it, rescale [deadzone, 1] to [0, 1], keeping direction. */
export function applyDeadzone(v: InputVector, deadzone: number): InputVector {
  const mag = Math.hypot(v.x, v.y)
  if (mag <= deadzone) return { x: 0, y: 0 }
  const scaled = (mag - deadzone) / (1 - deadzone)
  const k = Math.min(1, scaled) / mag
  return { x: v.x * k, y: v.y * k }
}
