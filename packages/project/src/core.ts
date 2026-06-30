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
const transform: ComponentTypeRegistration = {
  typeId: CORE_TYPE_IDS.transform,
  label: 'Transform',
  schema: {
    kind: 'object',
    fields: [
      { key: 'position', label: 'Position', kind: 'vec3', required: true },
      { key: 'rotation', label: 'Rotation (rad)', kind: 'vec3', required: true },
      { key: 'scale', label: 'Scale', kind: 'vec3', required: true }
    ]
  },
  defaultData: { position: { ...ORIGIN }, rotation: { ...ORIGIN }, scale: { ...UNIT } },
  cardinality: { min: 0, max: 1 }
}

/** Renderable primitive mesh. */
const primitive: ComponentTypeRegistration = {
  typeId: CORE_TYPE_IDS.primitive,
  label: 'Primitive',
  schema: {
    kind: 'object',
    fields: [
      { key: 'shape', label: 'Shape', kind: 'enum', required: true, values: ['box', 'cylinder', 'sphere', 'plane'] },
      { key: 'size', label: 'Size', kind: 'vec3', required: true }
    ]
  },
  defaultData: { shape: 'box', size: { ...UNIT } },
  cardinality: { min: 0, max: 1 }
}

/** Surface appearance: solid color plus optional texture resource reference. */
const surface: ComponentTypeRegistration = {
  typeId: CORE_TYPE_IDS.surface,
  label: 'Surface',
  schema: {
    kind: 'object',
    fields: [
      { key: 'color', label: 'Color', kind: 'color', required: true },
      { key: 'texture', label: 'Texture', kind: 'reference', required: false, target: 'resource' }
    ]
  },
  defaultData: { color: '#808080' },
  cardinality: { min: 0, max: 1 }
}

/** Physics collider shape plus surface friction. */
const collider: ComponentTypeRegistration = {
  typeId: CORE_TYPE_IDS.collider,
  label: 'Collider',
  schema: {
    kind: 'object',
    fields: [
      { key: 'shape', label: 'Shape', kind: 'enum', required: true, values: ['none', 'box', 'cylinder', 'sphere'] },
      { key: 'friction', label: 'Friction', kind: 'number', required: false, min: 0 }
    ]
  },
  defaultData: { shape: 'box', friction: 1 },
  cardinality: { min: 0, max: 1 }
}

/** Authoring trigger volume drawn as a translucent gizmo in the viewport. */
const zone: ComponentTypeRegistration = {
  typeId: CORE_TYPE_IDS.zone,
  label: 'Zone',
  schema: {
    kind: 'object',
    fields: [
      { key: 'shape', label: 'Shape', kind: 'enum', required: true, values: ['box', 'circle'] },
      // box uses (x,y,z) full dimensions; circle uses x as radius.
      { key: 'size', label: 'Size', kind: 'vec3', required: true },
      { key: 'color', label: 'Editor Color', kind: 'color', required: true }
    ]
  },
  defaultData: { shape: 'box', size: { ...UNIT }, color: '#39ff14' },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'zone' }
}

/** Perspective camera with an eye/target rig. */
const camera: ComponentTypeRegistration = {
  typeId: CORE_TYPE_IDS.camera,
  label: 'Camera',
  schema: {
    kind: 'object',
    fields: [
      { key: 'fov', label: 'Field of View', kind: 'number', required: true, min: 1, max: 179 },
      { key: 'eye', label: 'Eye', kind: 'vec3', required: true },
      { key: 'target', label: 'Target', kind: 'vec3', required: true }
    ]
  },
  defaultData: { fov: 60, eye: { x: 0, y: 5, z: 10 }, target: { ...ORIGIN } },
  cardinality: { min: 0, max: 1 }
}

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
