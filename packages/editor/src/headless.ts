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

// Generic project registration surface for headless hosts (MCP, agent).
export {
  registerEditorProject,
  type EditorProjectRegistration,
  type RegisteredEditorProject,
  type ProjectPlayHandle,
  type ProjectPreviewAdapter,
  type ProjectEvaluationAdapter,
  type ProjectEvaluationResult,
  type PrefabRegistration
} from './project/registration'
export {
  createProjectToolHost,
  type EditorProjectToolHost,
  type ProjectToolHostOptions
} from './project/toolHost'
export type { ProjectSelection } from './project/selection'
