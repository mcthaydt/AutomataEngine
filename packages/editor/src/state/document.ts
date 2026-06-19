import type { Reducer } from '@automata/engine'
import type { SceneModel } from '../model/gameDefinition'
import { CommandError } from '../model/gameDefinition'
import type { EditorAction } from './actions'

export const UNDO_LIMIT = 200

export interface DocumentState<Doc> {
  doc: Doc
  dirty: boolean
  past: Doc[]
  future: Doc[]
}

export function initialDocument<Doc>(scene: SceneModel<Doc>): DocumentState<Doc> {
  return { doc: scene.emptyDoc(), dirty: false, past: [], future: [] }
}

export function createDocumentReducer<Doc>(
  scene: SceneModel<Doc>
): Reducer<DocumentState<Doc>, EditorAction> {
  return (state, action) => {
    switch (action.type) {
      case 'command': {
        let next: Doc
        try {
          next = scene.apply(state.doc, action.command)
        } catch (error) {
          if (error instanceof CommandError) return state
          throw error
        }
        const past = [...state.past, state.doc].slice(-UNDO_LIMIT)
        return { doc: next, dirty: true, past, future: [] }
      }
      case 'loadDoc':
        return { doc: scene.parse(action.doc), dirty: false, past: [], future: [] }
      case 'undo': {
        const prev = state.past.at(-1)
        if (prev === undefined) return state
        return { doc: prev, dirty: true, past: state.past.slice(0, -1), future: [state.doc, ...state.future] }
      }
      case 'redo': {
        const [next, ...rest] = state.future
        if (next === undefined) return state
        return { doc: next, dirty: true, past: [...state.past, state.doc], future: rest }
      }
      default:
        return state
    }
  }
}
