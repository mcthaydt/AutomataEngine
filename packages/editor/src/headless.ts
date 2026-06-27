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
  SceneCommand,
  Brush,
  Field
} from './model/types'
export {
  CommandError,
  type SceneModel,
  type PlayHandle,
  type PlayDefinition,
  type GameDefinition,
  type HeadlessOpts,
  type TestPlayResult,
  type PlayObservation
} from './model/gameDefinition'
export { validateDoc } from './io/validation'
export {
  createEditorToolHost,
  type EditorToolHost,
  type EditorToolHostOptions
} from './agent/editorToolHost'
