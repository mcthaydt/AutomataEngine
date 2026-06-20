import type { EditorState } from '../state/store'

/** A chrome sub-panel updated by the shell's single store subscription. */
export interface PanelHandle<Doc> {
  update(state: EditorState<Doc>): void
  dispose(): void
}
