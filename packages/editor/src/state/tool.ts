export type ToolSelection =
  | { mode: 'select'; prefabId: null }
  | { mode: 'place'; prefabId: string }

export interface ToolState {
  selection: ToolSelection
}

export type ToolAction =
  | { type: 'setTool'; tool: ToolSelection }
  | { type: string }

export const initialTool: ToolState = {
  selection: { mode: 'select', prefabId: null }
}

/** Reusable ephemeral tool slice; authored changes still flow through project commands. */
export function toolReducer(state: ToolState, action: ToolAction): ToolState {
  return action.type === 'setTool'
    ? { selection: (action as { type: 'setTool'; tool: ToolSelection }).tool }
    : state
}
