import type { ItemKind } from '@automata/contracts'

export type {
  Vec3,
  Surface,
  ItemKind,
  BoxShape,
  CylinderShape,
  ArchetypeRef,
  MarkerRef,
  ItemShape,
  ItemTransform,
  SceneItem,
  SceneCommand
} from '@automata/contracts'

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
