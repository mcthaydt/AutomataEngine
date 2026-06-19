import type { Quat } from '../math/quat'
import type { Vec3 } from '../math/vec3'
import type { RenderableDef } from './types'
import type { GroupId, RenderPort } from './port'

export interface RenderCall {
  op: 'createGroup' | 'removeGroup' | 'setGroupRotation' | 'add' | 'setPose' | 'remove' | 'setCamera' | 'dispose'
  entity?: object
  def?: RenderableDef
  group?: GroupId
  position?: Vec3
  rotation?: Quat
  eulerRad?: Vec3
  lookAt?: Vec3
}

export interface NullRenderer {
  port: RenderPort
  calls: RenderCall[]
}

/** Recording RenderPort double for system tests, no Three.js involved. */
export function createNullRenderer(): NullRenderer {
  const calls: RenderCall[] = []
  const objects = new Set<object>()
  let nextGroupId: GroupId = 1

  const port: RenderPort = {
    get objectCount() { return objects.size },
    createGroup(group) {
      calls.push({ op: 'createGroup', group })
      return nextGroupId++
    },
    setGroupRotation(group, eulerRad) {
      calls.push({ op: 'setGroupRotation', group, eulerRad })
    },
    removeGroup(group) {
      calls.push({ op: 'removeGroup', group })
    },
    add(entity, def, group) {
      objects.add(entity)
      calls.push({ op: 'add', entity, def, group })
    },
    setPose(entity, position, rotation) {
      calls.push({ op: 'setPose', entity, position, rotation })
    },
    remove(entity) {
      objects.delete(entity)
      calls.push({ op: 'remove', entity })
    },
    setCamera(position, lookAt) {
      calls.push({ op: 'setCamera', position, lookAt })
    },
    dispose() {
      objects.clear()
      calls.push({ op: 'dispose' })
    }
  }

  return { port, calls }
}
