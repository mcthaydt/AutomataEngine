import type { Surface } from '../model/types'
import type { EditorAction, ToolSelection } from './actions'

export interface ToolState { selection: ToolSelection; surface: Surface }

export const initialTool: ToolState = {
  selection: { brushId: null, mode: 'select' },
  surface: { kind: 'color', value: '#e0e0e0' }
}

export function toolReducer(state: ToolState, action: EditorAction): ToolState {
  switch (action.type) {
    case 'setTool':
      return { ...state, selection: action.tool }
    case 'setSurfaceBrush':
      return { ...state, surface: action.surface }
    default:
      return state
  }
}
