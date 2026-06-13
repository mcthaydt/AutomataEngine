import type { Vec3 } from '../math/vec3'
import type { Pose, RigidBodyDef } from './types'

export interface PhysicsEvent {
  kind: 'contact' | 'sensor'
  started: boolean
  a: object
  b: object
}

export interface PhysicsPort {
  addBody(entity: object, def: RigidBodyDef, pose: Pose): void
  removeBody(entity: object): void
  setGravity(gravity: Vec3): void
  step(dt: number): PhysicsEvent[]
  readPose(entity: object): Pose | null
  readLinearVelocity(entity: object): Vec3
  applyImpulse(entity: object, impulse: Vec3): void
  setKinematicTarget(entity: object, position: Vec3): void
  readonly bodyCount: number
  dispose(): void
}
