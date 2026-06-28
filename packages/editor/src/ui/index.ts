export {
  renderEditorChrome,
  type EditorChromeHandle,
  type EditorChromeOptions
} from './chrome'
export type { PanelHandle } from './panel'
export { SLATE_PRO_CSS, injectTheme } from './theme.css'
// Generic project UI (coexists with the legacy chrome until cutover).
export { mountPropertyControl, type PropertyControlOptions, type PropertyControlHandle, type ReferenceOption } from './project/propertyControl'
export { mountPropertyTable, type PropertyTableOptions } from './project/propertyTable'
export { mountProjectInspector, type ProjectInspectorContext, type ProjectInspectorOptions, type ProjectInspectorHandle } from './project/inspector'
