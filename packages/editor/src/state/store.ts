import { combineReducers, createStore, type Store } from '@automata/engine'
import type { GameDefinition } from '../model/gameDefinition'
import type { SceneItem } from '../model/types'
import type { EditorAction } from './actions'
import { createDocumentReducer, initialDocument, type DocumentState } from './document'
import { initialMode, modeReducer, type Mode } from './mode'
import { initialSelection, selectionReducer } from './selection'
import { initialTool, toolReducer, type ToolState } from './tool'
import { initialUi, uiReducer, type UiState } from './ui'

export interface EditorState<Doc> {
  document: DocumentState<Doc>
  selection: string[]
  tool: ToolState
  mode: Mode
  ui: UiState
}

export type EditorStore<Doc> = Store<EditorState<Doc>, EditorAction>

export function createEditorStore<Doc>(definition: GameDefinition<Doc>): EditorStore<Doc> {
  const root = combineReducers<EditorState<Doc>, EditorAction>({
    document: createDocumentReducer(definition.scene),
    selection: selectionReducer,
    tool: toolReducer,
    mode: modeReducer,
    ui: uiReducer
  })
  const initial: EditorState<Doc> = {
    document: initialDocument(definition.scene),
    selection: initialSelection,
    tool: initialTool,
    mode: initialMode,
    ui: initialUi
  }
  return createStore(root, initial)
}

export const selectDoc = <Doc>(state: EditorState<Doc>): Doc => state.document.doc
export const selectSelection = <Doc>(state: EditorState<Doc>): string[] => state.selection

export function selectItems<Doc>(
  definition: GameDefinition<Doc>,
  state: EditorState<Doc>
): SceneItem[] {
  return definition.scene.listItems(state.document.doc)
}
