import type { Vec3 } from '../math/vec3'
import type { Quat } from '../math/quat'
import type { RenderableDef } from './types'

export type GroupId = number
export type GridId = number

export interface RenderPort {
  /** Creates a scene-graph group; parentless groups attach to the root. */
  createGroup(parent?: GroupId): GroupId
  setGroupRotation(group: GroupId, eulerRad: Vec3): void
  /** Detaches and forgets a group; remove its entities first. */
  removeGroup(group: GroupId): void
  /** Adds a reference grid on the ground plane; returns a handle for removal. */
  setGrid(opts: { size: number; divisions: number; color: string }): GridId
  removeGrid(grid: GridId): void
  /** Toggles a selection highlight on a previously-added entity (no-op if unknown). */
  setHighlight(entity: object, on: boolean): void
  add(entity: object, def: RenderableDef, group?: GroupId): void
  setPose(entity: object, position: Vec3, rotation: Quat): void
  remove(entity: object): void
  setCamera(position: Vec3, lookAt: Vec3): void
  readonly objectCount: number
  dispose(): void
}
