import { CORE_TYPE_IDS } from './core'
import type { SceneDocument, EntityDocument } from './model'

/**
 * Pure authoring transform math — no engine dependency.
 *
 * Entity `core.transform` positions/rotations are local to `parentId`. This
 * module composes a hierarchy into world space (TRS: scale, then quaternion
 * rotation from Euler radians, then translation) and inverts a world target
 * back into a parent-local position so the editor can drag world-space gizmos.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

export interface WorldTransform {
  position: Vec3
  rotation: Quat
  scale: Vec3
}

/** Thrown when a transform hierarchy is malformed (missing parent or a cycle). */
export class ProjectTransformError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectTransformError'
  }
}

const IDENTITY: WorldTransform = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } }

interface LocalTransform {
  position: Vec3
  rotation: Vec3
  scale: Vec3
}

function vec3(value: unknown, fallback: Vec3): Vec3 {
  if (typeof value !== 'object' || value === null) return { ...fallback }
  const v = value as Record<string, unknown>
  return {
    x: typeof v.x === 'number' ? v.x : fallback.x,
    y: typeof v.y === 'number' ? v.y : fallback.y,
    z: typeof v.z === 'number' ? v.z : fallback.z
  }
}

function localTransform(entity: EntityDocument): LocalTransform {
  const component = entity.components.find((c) => c.typeId === CORE_TYPE_IDS.transform)
  const data = (component?.data ?? {}) as Record<string, unknown>
  return {
    position: vec3(data.position, { x: 0, y: 0, z: 0 }),
    rotation: vec3(data.rotation, { x: 0, y: 0, z: 0 }),
    scale: vec3(data.scale, { x: 1, y: 1, z: 1 })
  }
}

/** Quaternion from intrinsic XYZ Euler radians (matches the engine convention). */
function eulerToQuat(e: Vec3): Quat {
  const cx = Math.cos(e.x / 2), sx = Math.sin(e.x / 2)
  const cy = Math.cos(e.y / 2), sy = Math.sin(e.y / 2)
  const cz = Math.cos(e.z / 2), sz = Math.sin(e.z / 2)
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz
  }
}

function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  }
}

/** Conjugate equals inverse for the unit quaternions this module produces. */
function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w }
}

function rotateVec(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y)
  const ty = 2 * (q.z * v.x - q.x * v.z)
  const tz = 2 * (q.x * v.y - q.y * v.x)
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx)
  }
}

/** Walk root→entity, returning every ancestor; throws on missing parent/cycle. */
function ancestorChain(scene: SceneDocument, entityId: string): EntityDocument[] {
  const byId = new Map(scene.entities.map((entity) => [entity.id, entity]))
  const start = byId.get(entityId)
  if (!start) throw new ProjectTransformError(`Unknown entity: ${entityId}`)

  const chain: EntityDocument[] = []
  const visited = new Set<string>()
  let current: EntityDocument | undefined = start
  while (current) {
    if (visited.has(current.id)) throw new ProjectTransformError(`Parent cycle detected at entity: ${current.id}`)
    visited.add(current.id)
    chain.push(current)
    if (current.parentId === undefined) break
    const parent = byId.get(current.parentId)
    if (!parent) throw new ProjectTransformError(`Missing parent "${current.parentId}" for entity "${current.id}"`)
    current = parent
  }
  return chain.reverse()
}

/** Resolve an entity's full world transform by composing its ancestor chain. */
export function resolveWorldTransform(scene: SceneDocument, entityId: string): WorldTransform {
  let world: WorldTransform = { position: { ...IDENTITY.position }, rotation: { ...IDENTITY.rotation }, scale: { ...IDENTITY.scale } }
  for (const entity of ancestorChain(scene, entityId)) {
    const local = localTransform(entity)
    const scaled = { x: world.scale.x * local.position.x, y: world.scale.y * local.position.y, z: world.scale.z * local.position.z }
    const rotated = rotateVec(world.rotation, scaled)
    world = {
      position: { x: world.position.x + rotated.x, y: world.position.y + rotated.y, z: world.position.z + rotated.z },
      rotation: quatMul(world.rotation, eulerToQuat(local.rotation)),
      scale: { x: world.scale.x * local.scale.x, y: world.scale.y * local.scale.y, z: world.scale.z * local.scale.z }
    }
  }
  return world
}

/** Convert a desired world position into a position local to `parentWorld`. */
export function worldToLocalPosition(parentWorld: WorldTransform, world: Vec3): Vec3 {
  const rel = { x: world.x - parentWorld.position.x, y: world.y - parentWorld.position.y, z: world.z - parentWorld.position.z }
  const unrotated = rotateVec(quatConjugate(parentWorld.rotation), rel)
  return {
    x: unrotated.x / parentWorld.scale.x,
    y: unrotated.y / parentWorld.scale.y,
    z: unrotated.z / parentWorld.scale.z
  }
}
