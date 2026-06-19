import type { EditorAction } from './actions'

export const initialSelection: string[] = []

export function selectionReducer(state: string[], action: EditorAction): string[] {
  switch (action.type) {
    case 'select':
      return action.ids
    case 'command':
      if (action.command.type === 'deleteItems') {
        const removed = new Set(action.command.ids)
        return state.filter((id) => !removed.has(id))
      }
      return state
    default:
      return state
  }
}
