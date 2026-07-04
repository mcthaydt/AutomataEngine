import { z } from 'zod'
import { color, reference, vec3 } from './authoring'
import { normalizeComponentType } from './registration'
import type { ComponentTypeRegistration, GameProjectDefinition, ResourceTypeRegistration } from './registration'

/**
 * Standard, game-agnostic authoring components.
 *
 * Every game registration is combined with these by the editor/headless hosts,
 * so transform/primitive/surface/collider/zone/camera behave identically across
 * games and the generic viewport can project them without game knowledge.
 */

export const CORE_TYPE_IDS = {
  transform: 'core.transform',
  primitive: 'core.primitive',
  surface: 'core.surface',
  collider: 'core.collider',
  zone: 'core.zone',
  camera: 'core.camera'
} as const

export type CoreTypeId = (typeof CORE_TYPE_IDS)[keyof typeof CORE_TYPE_IDS]

const ORIGIN = { x: 0, y: 0, z: 0 }
const UNIT = { x: 1, y: 1, z: 1 }

/** Local-space transform: position/rotation are local to the entity's parent. */
const transform: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.transform,
  label: 'Transform',
  schema: z.strictObject({
    position: vec3({ label: 'Position' }),
    rotation: vec3({ label: 'Rotation (rad)' }),
    scale: vec3({ label: 'Scale' })
  }),
  defaultData: { position: { ...ORIGIN }, rotation: { ...ORIGIN }, scale: { ...UNIT } },
  cardinality: { min: 0, max: 1 }
})

/** Renderable primitive mesh. */
const primitive: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.primitive,
  label: 'Primitive',
  schema: z.strictObject({
    shape: z.enum(['box', 'cylinder', 'sphere', 'plane']).meta({ label: 'Shape' }),
    size: vec3({ label: 'Size' })
  }),
  defaultData: { shape: 'box', size: { ...UNIT } },
  cardinality: { min: 0, max: 1 }
})

/** Surface appearance: solid color plus optional texture resource reference. */
const surface: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.surface,
  label: 'Surface',
  schema: z.strictObject({
    color: color({ label: 'Color' }),
    texture: reference({ target: 'resource', label: 'Texture' }).optional()
  }),
  defaultData: { color: '#808080' },
  cardinality: { min: 0, max: 1 }
})

/** Physics collider shape plus surface friction. */
const collider: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.collider,
  label: 'Collider',
  schema: z.strictObject({
    shape: z.enum(['none', 'box', 'cylinder', 'sphere']).meta({ label: 'Shape' }),
    friction: z.number().min(0).meta({ label: 'Friction' }).optional()
  }),
  defaultData: { shape: 'box', friction: 1 },
  cardinality: { min: 0, max: 1 }
})

/** Authoring trigger volume drawn as a translucent gizmo in the viewport. */
const zone: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.zone,
  label: 'Zone',
  schema: z.strictObject({
    shape: z.enum(['box', 'circle']).meta({ label: 'Shape' }),
    // box uses (x,y,z) full dimensions; circle uses x as radius.
    size: vec3({ label: 'Size' }),
    color: color({ label: 'Editor Color' })
  }),
  defaultData: { shape: 'box', size: { ...UNIT }, color: '#39ff14' },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'zone' }
})

/** Perspective camera with an eye/target rig. */
const camera: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.camera,
  label: 'Camera',
  schema: z.strictObject({
    fov: z.number().min(1).max(179).meta({ label: 'Field of View' }),
    eye: vec3({ label: 'Eye' }),
    target: vec3({ label: 'Target' })
  }),
  defaultData: { fov: 60, eye: { x: 0, y: 5, z: 10 }, target: { ...ORIGIN } },
  cardinality: { min: 0, max: 1 }
})

/** All standard components, in stable display order. */
export const CORE_COMPONENTS: readonly ComponentTypeRegistration[] = [
  transform,
  primitive,
  surface,
  collider,
  zone,
  camera
]

/** Index a definition's components (core first, then game) by type ID. */
export function indexComponents(definition: GameProjectDefinition<unknown>): Map<string, ComponentTypeRegistration> {
  const map = new Map<string, ComponentTypeRegistration>()
  for (const component of CORE_COMPONENTS) map.set(component.typeId, component)
  for (const component of definition.components) map.set(component.typeId, component)
  return map
}

/** Index a definition's resource registrations by type ID. */
export function indexResources(definition: GameProjectDefinition<unknown>): Map<string, ResourceTypeRegistration> {
  return new Map(definition.resources.map((resource) => [resource.typeId, resource]))
}
