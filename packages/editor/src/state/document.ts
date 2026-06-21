import type { Reducer } from '@automata/engine'
import type { SceneModel } from '../model/gameDefinition'
import { CommandError } from '../model/gameDefinition'
import type { EditorAction } from './actions'

export const UNDO_LIMIT = 200

export interface DocumentState<Doc> {
  doc: Doc
  /** Last persisted/loaded doc; `dirty` is just `doc !== savedDoc`. */
  savedDoc: Doc
  dirty: boolean
  past: Doc[]
  future: Doc[]
}

export function initialDocument<Doc>(scene: SceneModel<Doc>): DocumentState<Doc> {
  const doc = scene.emptyDoc()
  return { doc, savedDoc: doc, dirty: false, past: [], future: [] }
}

export function createDocumentReducer<Doc>(
  scene: SceneModel<Doc>
): Reducer<DocumentState<Doc>, EditorAction> {
  // Reducers return new doc references only on real change, so identity against
  // savedDoc is exact: undoing back to the loaded doc reads as not-dirty.
  const dirtyOf = (state: DocumentState<Doc>, doc: Doc): boolean => doc !== state.savedDoc
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
        return { ...state, doc: next, dirty: dirtyOf(state, next), past, future: [] }
      }
      case 'loadDoc': {
        const doc = scene.parse(action.doc)
        return { doc, savedDoc: doc, dirty: false, past: [], future: [] }
      }
      case 'undo': {
        const prev = state.past.at(-1)
        if (prev === undefined) return state
        return { ...state, doc: prev, dirty: dirtyOf(state, prev), past: state.past.slice(0, -1), future: [state.doc, ...state.future] }
      }
      case 'redo': {
        const [next, ...rest] = state.future
        if (next === undefined) return state
        return { ...state, doc: next, dirty: dirtyOf(state, next), past: [...state.past, state.doc], future: rest }
      }
      default:
        return state
    }
  }
}
