import type { ProjectCommand, ProjectSnapshot } from '@automata/project'
import type { ProjectSelection } from './selection'

export type PrimaryView = '2d' | '3d'

/** Save lifecycle, surfaced in the toolbar. */
export type ProjectSaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string; paths: string[] }

/** Everything the project session can be asked to do. */
export type ProjectEditorAction =
  | { type: 'projectCommand'; command: ProjectCommand }
  | { type: 'projectCommandBatch'; commands: ProjectCommand[] }
  | { type: 'loadSnapshot'; snapshot: ProjectSnapshot }
  | { type: 'select'; selection: ProjectSelection }
  | { type: 'setActiveScene'; sceneId: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'setMode'; mode: 'edit' | 'play' }
  | { type: 'beginSave' }
  | { type: 'markSaved'; paths: string[] }
  | { type: 'saveFailed'; message: string; paths: string[] }
  | { type: 'setSnap'; snap: number }
  | { type: 'setPrimaryView'; view: PrimaryView }
  | { type: 'toggleInset' }
