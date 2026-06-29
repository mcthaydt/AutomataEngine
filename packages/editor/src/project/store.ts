import { createStore, type Store } from '@automata/engine'
import {
  applyProjectCommand, applyProjectCommands, ProjectCommandError, PROJECT_MANIFEST_PATH,
  type ProjectSnapshot
} from '@automata/project'
import type { PrimaryView, ProjectEditorAction, ProjectSaveStatus } from './actions'
import { initialProjectSelection, reconcileSelection, type ProjectSelection } from './selection'
import { registerEditorProject, type EditorProjectRegistration, type RegisteredEditorProject } from './registration'

/**
 * The project editor session store.
 *
 * Holds the live snapshot plus the last-saved snapshot, deriving dirty document
 * paths by reference identity (commands share structure for unchanged docs, so a
 * changed reference is exactly a changed document). Undo/redo move whole
 * snapshots; `markSaved` adopts the current docs for the given paths so undoing
 * a saved edit correctly re-dirties it. Command errors are swallowed (parity
 * with the legacy document slice) so invalid edits never crash the session.
 */

export const PROJECT_UNDO_LIMIT = 200

export interface ProjectEditorState {
  registration: RegisteredEditorProject
  snapshot: ProjectSnapshot
  savedSnapshot: ProjectSnapshot
  dirtyPaths: string[]
  past: ProjectSnapshot[]
  future: ProjectSnapshot[]
  activeSceneId: string
  selection: ProjectSelection
  mode: 'edit' | 'play'
  saveStatus: ProjectSaveStatus
  snap: number
  primaryView: PrimaryView
  insetVisible: boolean
}

export type ProjectEditorStore = Store<ProjectEditorState, ProjectEditorAction>

/** Paths whose live document differs (by reference) from the saved snapshot. */
function computeDirtyPaths(snapshot: ProjectSnapshot, saved: ProjectSnapshot): string[] {
  const paths: string[] = []
  if (snapshot.manifest !== saved.manifest) paths.push(PROJECT_MANIFEST_PATH)
  for (const entry of snapshot.manifest.scenes) {
    if (snapshot.scenes[entry.id] !== saved.scenes[entry.id]) paths.push(entry.path)
  }
  for (const entry of snapshot.manifest.resources) {
    if (snapshot.resources[entry.id] !== saved.resources[entry.id]) paths.push(entry.path)
  }
  return paths
}

/** Adopt the live document(s) for `paths` into the saved snapshot. */
function applyMarkSaved(saved: ProjectSnapshot, snapshot: ProjectSnapshot, paths: string[]): ProjectSnapshot {
  let result = saved
  for (const path of paths) {
    if (path === PROJECT_MANIFEST_PATH) {
      result = { ...result, manifest: snapshot.manifest }
      continue
    }
    const sceneEntry = snapshot.manifest.scenes.find((entry) => entry.path === path)
    const scene = sceneEntry && snapshot.scenes[sceneEntry.id]
    if (sceneEntry && scene) {
      result = { ...result, scenes: { ...result.scenes, [sceneEntry.id]: scene } }
      continue
    }
    const resourceEntry = snapshot.manifest.resources.find((entry) => entry.path === path)
    const resource = resourceEntry && snapshot.resources[resourceEntry.id]
    if (resourceEntry && resource) {
      result = { ...result, resources: { ...result.resources, [resourceEntry.id]: resource } }
    }
  }
  return result
}

/**
 * Build a project session store. Accepts the raw editor registration and
 * registers it internally; the registered project is exposed on state so a host
 * can reuse it (e.g. `store.getState().registration`) without re-registering.
 */
export function createProjectEditorStore<Compiled>(
  registration: EditorProjectRegistration<Compiled> | RegisteredEditorProject,
  snapshot: ProjectSnapshot
): ProjectEditorStore {
  const registered = 'gameId' in registration
    ? registration
    : registerEditorProject(registration)
  const initial: ProjectEditorState = {
    registration: registered,
    snapshot,
    savedSnapshot: snapshot,
    dirtyPaths: [],
    past: [],
    future: [],
    activeSceneId: snapshot.manifest.entrySceneId,
    selection: initialProjectSelection,
    mode: 'edit',
    saveStatus: { kind: 'idle' },
    snap: 0.5,
    primaryView: '2d',
    insetVisible: true
  }

  /** Commit a freshly-reduced snapshot, recording undo and re-deriving dirt/selection. */
  const commit = (state: ProjectEditorState, next: ProjectSnapshot): ProjectEditorState => {
    if (next === state.snapshot) return state
    return {
      ...state,
      snapshot: next,
      past: [...state.past, state.snapshot].slice(-PROJECT_UNDO_LIMIT),
      future: [],
      dirtyPaths: computeDirtyPaths(next, state.savedSnapshot),
      selection: reconcileSelection(next, state.selection)
    }
  }

  const reducer = (state: ProjectEditorState, action: ProjectEditorAction): ProjectEditorState => {
    switch (action.type) {
      case 'projectCommand':
        try {
          return commit(state, applyProjectCommand(registered.project, state.snapshot, action.command))
        } catch (error) {
          if (error instanceof ProjectCommandError) return state
          throw error
        }
      case 'projectCommandBatch':
        if (action.commands.length === 0) return state
        try {
          return commit(state, applyProjectCommands(registered.project, state.snapshot, action.commands))
        } catch (error) {
          if (error instanceof ProjectCommandError) return state
          throw error
        }
      case 'loadSnapshot':
        return {
          ...state,
          snapshot: action.snapshot,
          savedSnapshot: action.snapshot,
          dirtyPaths: [],
          past: [],
          future: [],
          activeSceneId: action.snapshot.manifest.entrySceneId,
          selection: initialProjectSelection,
          saveStatus: { kind: 'idle' }
        }
      case 'select':
        return { ...state, selection: reconcileSelection(state.snapshot, action.selection) }
      case 'setActiveScene':
        return { ...state, activeSceneId: action.sceneId }
      case 'undo': {
        const prev = state.past.at(-1)
        if (prev === undefined) return state
        return {
          ...state,
          snapshot: prev,
          past: state.past.slice(0, -1),
          future: [state.snapshot, ...state.future],
          dirtyPaths: computeDirtyPaths(prev, state.savedSnapshot),
          selection: reconcileSelection(prev, state.selection)
        }
      }
      case 'redo': {
        const [next, ...rest] = state.future
        if (next === undefined) return state
        return {
          ...state,
          snapshot: next,
          past: [...state.past, state.snapshot],
          future: rest,
          dirtyPaths: computeDirtyPaths(next, state.savedSnapshot),
          selection: reconcileSelection(next, state.selection)
        }
      }
      case 'setMode':
        return { ...state, mode: action.mode }
      case 'beginSave':
        return { ...state, saveStatus: { kind: 'saving' } }
      case 'markSaved': {
        const savedSnapshot = applyMarkSaved(state.savedSnapshot, state.snapshot, action.paths)
        return { ...state, savedSnapshot, dirtyPaths: computeDirtyPaths(state.snapshot, savedSnapshot), saveStatus: { kind: 'saved' } }
      }
      case 'markExported':
        return {
          ...state,
          savedSnapshot: state.snapshot,
          dirtyPaths: [],
          saveStatus: { kind: 'exported' }
        }
      case 'saveFailed':
        return { ...state, saveStatus: { kind: 'error', message: action.message, paths: action.paths } }
      case 'setSnap':
        return { ...state, snap: action.snap }
      case 'setPrimaryView':
        return { ...state, primaryView: action.view }
      case 'toggleInset':
        return { ...state, insetVisible: !state.insetVisible }
    }
  }

  return createStore(reducer, initial)
}

export const selectProjectSnapshot = (state: ProjectEditorState): ProjectSnapshot => state.snapshot
export const selectActiveScene = (state: ProjectEditorState) => state.snapshot.scenes[state.activeSceneId]
