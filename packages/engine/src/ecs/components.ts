import { vec3, type Vec3 } from '../math/vec3'
import { quat, type Quat } from '../math/quat'
import type { RigidBodyDef } from '../physics/types'
import type { RenderableDef } from '../render/types'

export interface Transform {
  position: Vec3
  rotation: Quat
  prevPosition: Vec3
  prevRotation: Quat
}

export function createTransform(
  position: Vec3 = vec3.create(),
  rotation: Quat = quat.identity()
): Transform {
  return {
    position: vec3.clone(position),
    rotation: { ...rotation },
    prevPosition: vec3.clone(position),
    prevRotation: { ...rotation }
  }
}

/** Base entity: engine mechanism components. Games extend with meaning. */
export interface EngineEntity {
  transform?: Transform
  rigidBody?: RigidBodyDef
  renderable?: RenderableDef
  particle?: { velocity: Vec3; gravity: number }
  lifetime?: { remainingS: number }
}
