import type { Vec3 } from '../math/vec3'
import type { Quat } from '../math/quat'
import type { RenderableDef } from './types'

export type GroupId = number

export interface RenderPort {
  /** Creates a scene-graph group; parentless groups attach to the root. */
  createGroup(parent?: GroupId): GroupId
  setGroupRotation(group: GroupId, eulerRad: Vec3): void
  add(entity: object, def: RenderableDef, group?: GroupId): void
  setPose(entity: object, position: Vec3, rotation: Quat): void
  remove(entity: object): void
  setCamera(position: Vec3, lookAt: Vec3): void
  readonly objectCount: number
  dispose(): void
}
