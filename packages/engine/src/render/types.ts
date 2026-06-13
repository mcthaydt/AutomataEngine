import type { Vec3 } from '../math/vec3'

export type RenderableDef =
  | { primitive: 'box'; size: Vec3; color: string }
  | { primitive: 'sphere'; radius: number; color: string }
  | { primitive: 'cylinder'; radius: number; height: number; color: string }
