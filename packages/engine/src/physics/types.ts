import type { Vec3 } from '../math/vec3'
import type { Quat } from '../math/quat'

export type BodyKind = 'dynamic' | 'kinematic' | 'fixed'

export type ShapeDef =
  | { type: 'sphere'; radius: number }
  | { type: 'box'; halfExtents: Vec3 }
  | { type: 'cylinder'; halfHeight: number; radius: number }

export interface RigidBodyDef {
  kind: BodyKind
  shape: ShapeDef
  friction?: number
  restitution?: number
  sensor?: boolean
}

export interface Pose { position: Vec3; rotation: Quat }
