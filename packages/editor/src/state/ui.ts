import type { ProjectEditorAction } from '../project/actions'

export type PrimaryView = '2d' | '3d'

export interface UiState {
  snap: number
  primaryView: PrimaryView
  insetVisible: boolean
}

export const initialUi: UiState = { snap: 0.5, primaryView: '2d', insetVisible: true }

export function uiReducer(state: UiState, action: ProjectEditorAction): UiState {
  switch (action.type) {
    case 'setSnap':
      return { ...state, snap: action.snap }
    case 'setPrimaryView':
      return { ...state, primaryView: action.view }
    case 'toggleInset':
      return { ...state, insetVisible: !state.insetVisible }
    default:
      return state
  }
}
