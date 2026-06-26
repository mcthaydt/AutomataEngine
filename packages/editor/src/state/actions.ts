import type { SceneCommand, Surface } from '../model/types'
import type { PrimaryView } from './ui'

export interface ToolSelection { brushId: string | null; mode: 'select' | 'place' | 'surface' }

export type EditorAction =
  | { type: 'command'; command: SceneCommand }
  | { type: 'commandBatch'; commands: SceneCommand[] }
  | { type: 'loadDoc'; doc: unknown }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: string[] }
  | { type: 'setTool'; tool: ToolSelection }
  | { type: 'setSurfaceBrush'; surface: Surface }
  | { type: 'setMode'; mode: 'edit' | 'play' }
  | { type: 'setSnap'; snap: number }
  | { type: 'setPrimaryView'; view: PrimaryView }
  | { type: 'toggleInset' }
