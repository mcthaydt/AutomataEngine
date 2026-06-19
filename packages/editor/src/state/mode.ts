import type { EditorAction } from './actions'

export type Mode = 'edit' | 'play'
export const initialMode: Mode = 'edit'

export function modeReducer(state: Mode, action: EditorAction): Mode {
  return action.type === 'setMode' ? action.mode : state
}
