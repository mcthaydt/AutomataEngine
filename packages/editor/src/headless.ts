/** Browser-free project registration and tool-host surface for agents and MCP. */
export {
  createProjectCatalog,
  resolveRegistrationLoader,
  type EditorRegistrationLoader,
  type ProjectCatalog,
  type RegistrationDeps
} from './project/catalog'
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
