import type { Vec3 } from '@automata/engine'

export type ItemKind = 'box' | 'cylinder' | 'archetype' | 'marker'

export interface BoxShape { type: 'box'; size: Vec3 }
export interface CylinderShape { type: 'cylinder'; radius: number; height: number }
export interface ArchetypeRef { type: 'archetype'; name: string }
export interface MarkerRef { type: 'marker'; markerId: string }
export type ItemShape = BoxShape | CylinderShape | ArchetypeRef | MarkerRef

/** Per-item appearance; only color is resolvable until engine assets exist. */
export type Surface =
  | { kind: 'color'; value: string }
  | { kind: 'texture'; textureId: string }

export interface ItemTransform { position: Vec3; rotationEuler: Vec3 }

/** A placeable thing in the scene, surfaced generically to viewport and tools. */
export interface SceneItem {
  id: string
  kind: ItemKind
  transform: ItemTransform
  shape: ItemShape
  surface: Surface
}

/** A pure, serializable edit. The only way an editor document mutates. */
export type SceneCommand =
  | { type: 'addItem'; item: SceneItem }
  | { type: 'moveSelected'; ids: string[]; delta: Vec3 }
  | { type: 'setItemField'; id: string; path: string; value: unknown }
  | { type: 'setSurface'; id: string; surface: Surface }
  | { type: 'setMetadata'; path: string; value: unknown }
  | { type: 'deleteItems'; ids: string[] }
  | { type: 'loadDoc'; doc: unknown }

/** A brush is a placeable; cardinality is enforced generically by the editor. */
export interface Brush {
  id: string
  label: string
  kind: ItemKind
  place: 'point' | 'draw-box' | 'draw-circle'
  cardinality: { min: number; max: number }
  ref?: string
}

/** A single inspector form field, generated from the document. */
export interface Field {
  path: string
  label: string
  type: 'number' | 'text'
  value: number | string
}
