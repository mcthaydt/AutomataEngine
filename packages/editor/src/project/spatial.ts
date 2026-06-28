import type { Quat, RenderableDef, Vec3 } from '@automata/engine'
import {
  CORE_TYPE_IDS, ProjectTransformError, resolveWorldTransform,
  type ComponentInstance, type ComponentTypeRegistration, type EntityDocument, type SceneDocument
} from '@automata/project'
import type { Bounds } from '../viewport3d/aabb'

/**
 * Game-agnostic projection of a scene into renderable/pickable spatial items.
 *
 * Each entity becomes at most one `SpatialItem`: a primitive entity renders as
 * its mesh; an entity with a `core.zone` or a registration gizmo renders as a
 * translucent gizmo; an entity with only plain components is omitted. World
 * transforms are resolved through the project hierarchy and primitive sizes are
 * scaled into world space, so the viewport never branches on any game.
 */
export interface SpatialItem {
  entityId: string
  position: Vec3
  rotation: Quat
  renderable: RenderableDef
  color: string
  bounds: Bounds
  /** True for translucent zone/point gizmos, false for solid geometry. */
  gizmo: boolean
}

const DEFAULT_COLOR = '#9aa4b2'
const DEFAULT_GIZMO_COLOR = '#39ff14'

interface Vec3Like { x: number; y: number; z: number }

const mul = (a: Vec3Like, b: Vec3Like): Vec3 => ({ x: a.x * b.x, y: a.y * b.y, z: a.z * b.z })

function componentOf(entity: EntityDocument, typeId: string): ComponentInstance | undefined {
  return entity.components.find((component) => component.typeId === typeId)
}

/** Project every projectable entity of a scene into spatial items, in scene order. */
export function buildProjectSpatialItems(scene: SceneDocument, componentTypes: readonly ComponentTypeRegistration[]): SpatialItem[] {
  const gizmoByType = new Map(componentTypes.filter((type) => type.gizmo).map((type) => [type.typeId, type]))
  const items: SpatialItem[] = []
  for (const entity of scene.entities) {
    let world
    try {
      world = resolveWorldTransform(scene, entity.id)
    } catch (error) {
      if (error instanceof ProjectTransformError) continue
      throw error
    }
    const item = projectEntity(entity, world, gizmoByType)
    if (item) items.push(item)
  }
  return items
}

function projectEntity(
  entity: EntityDocument,
  world: { position: Vec3; rotation: Quat; scale: Vec3 },
  gizmoByType: Map<string, ComponentTypeRegistration>
): SpatialItem | null {
  const primitive = componentOf(entity, CORE_TYPE_IDS.primitive)
  if (primitive) return projectPrimitive(entity, world, primitive)

  const zone = componentOf(entity, CORE_TYPE_IDS.zone)
  if (zone) return projectZone(entity, world, zone)

  for (const component of entity.components) {
    const registration = gizmoByType.get(component.typeId)
    if (registration?.gizmo) return projectGizmo(entity, world, registration)
  }
  return null
}

function projectPrimitive(entity: EntityDocument, world: { position: Vec3; rotation: Quat; scale: Vec3 }, primitive: ComponentInstance): SpatialItem {
  const data = primitive.data as { shape: string; size: Vec3Like }
  const size = mul(data.size, world.scale)
  const color = (componentOf(entity, CORE_TYPE_IDS.surface)?.data as { color?: string } | undefined)?.color ?? DEFAULT_COLOR
  const { renderable, bounds } = shapeOf(data.shape, size, color)
  return { entityId: entity.id, position: world.position, rotation: world.rotation, renderable, color, bounds, gizmo: false }
}

function projectZone(entity: EntityDocument, world: { position: Vec3; rotation: Quat; scale: Vec3 }, zone: ComponentInstance): SpatialItem {
  const data = zone.data as { shape: 'box' | 'circle'; size: Vec3Like; color?: string }
  const color = data.color ?? DEFAULT_GIZMO_COLOR
  const size = mul(data.size, world.scale)
  if (data.shape === 'circle') {
    const radius = size.x
    return {
      entityId: entity.id, position: world.position, rotation: world.rotation,
      renderable: { primitive: 'cylinder', radius, height: size.y, color }, color,
      bounds: { kind: 'cylinder', radius, halfHeight: size.y / 2 }, gizmo: true
    }
  }
  return {
    entityId: entity.id, position: world.position, rotation: world.rotation,
    renderable: { primitive: 'box', size, color }, color,
    bounds: { kind: 'box', half: { x: size.x / 2, y: size.y / 2, z: size.z / 2 } }, gizmo: true
  }
}

function projectGizmo(entity: EntityDocument, world: { position: Vec3; rotation: Quat; scale: Vec3 }, registration: ComponentTypeRegistration): SpatialItem {
  const gizmo = registration.gizmo!
  const color = gizmo.color ?? DEFAULT_GIZMO_COLOR
  if (gizmo.kind === 'zone') {
    const half = { x: world.scale.x / 2, y: world.scale.y / 2, z: world.scale.z / 2 }
    return {
      entityId: entity.id, position: world.position, rotation: world.rotation,
      renderable: { primitive: 'box', size: world.scale, color }, color,
      bounds: { kind: 'box', half }, gizmo: true
    }
  }
  const half = gizmo.size ?? 0.5
  const span = half * 2
  return {
    entityId: entity.id, position: world.position, rotation: world.rotation,
    renderable: { primitive: 'box', size: { x: span, y: span, z: span }, color }, color,
    bounds: { kind: 'point', half }, gizmo: true
  }
}

function shapeOf(shape: string, size: Vec3, color: string): { renderable: RenderableDef; bounds: Bounds } {
  switch (shape) {
    case 'cylinder':
      return { renderable: { primitive: 'cylinder', radius: size.x / 2, height: size.y, color }, bounds: { kind: 'cylinder', radius: size.x / 2, halfHeight: size.y / 2 } }
    case 'sphere':
      return { renderable: { primitive: 'sphere', radius: size.x / 2, color }, bounds: { kind: 'box', half: { x: size.x / 2, y: size.x / 2, z: size.x / 2 } } }
    default:
      // box and plane both project to a box footprint (plane is just thin).
      return { renderable: { primitive: 'box', size, color }, bounds: { kind: 'box', half: { x: size.x / 2, y: size.y / 2, z: size.z / 2 } } }
  }
}
