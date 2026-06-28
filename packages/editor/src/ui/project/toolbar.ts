import type { ProjectEditorAction } from '../../project/actions'
import type { ProjectEditorState } from '../../project/store'

/**
 * Project toolbar: project switch, Save, Export/Import Bundle, Undo/Redo, and
 * Play/Stop, plus a save-status readout. Side-effecting actions (save, bundle
 * I/O, switch, play) are injected callbacks; UI code never calls browser APIs.
 */
export interface ProjectToolbarCallbacks {
  onSwitchProject?: () => void
  onSave?: () => void
  onExport?: () => void
  onImport?: () => void
  onPlay: () => void
  onStop: () => void
}

export interface ProjectToolbarOptions {
  dispatch: (action: ProjectEditorAction) => void
  callbacks: ProjectToolbarCallbacks
}

export interface ProjectToolbarHandle {
  update(state: ProjectEditorState): void
  dispose(): void
}

export function mountProjectToolbar(parent: HTMLElement, options: ProjectToolbarOptions): ProjectToolbarHandle {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-toolbar'
  root.dataset.projectToolbar = ''
  parent.append(root)
  return {
    update(state) { render(root, state, options) },
    dispose() { root.remove() }
  }
}

function button(label: string, attribute: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.setAttribute(attribute, '')
  element.textContent = label
  element.addEventListener('click', onClick)
  return element
}

function render(root: HTMLElement, state: ProjectEditorState, options: ProjectToolbarOptions): void {
  root.replaceChildren()
  const { callbacks } = options

  if (callbacks.onSwitchProject) root.append(button('Switch Project', 'data-switch', callbacks.onSwitchProject))
  if (callbacks.onSave) root.append(button('Save', 'data-save', callbacks.onSave))
  if (callbacks.onExport) root.append(button('Export Bundle', 'data-export', callbacks.onExport))
  if (callbacks.onImport) root.append(button('Import Bundle', 'data-import', callbacks.onImport))
  root.append(button('Undo', 'data-undo', () => options.dispatch({ type: 'undo' })))
  root.append(button('Redo', 'data-redo', () => options.dispatch({ type: 'redo' })))

  const playing = state.mode === 'play'
  root.append(button(playing ? 'Stop' : 'Play', 'data-play', playing ? callbacks.onStop : callbacks.onPlay))

  const status = document.createElement('span')
  status.className = 'ed-save-status'
  status.dataset.saveStatus = ''
  status.textContent = statusText(state)
  root.append(status)
}

function statusText(state: ProjectEditorState): string {
  switch (state.saveStatus.kind) {
    case 'saving': return 'Saving…'
    case 'saved': return 'Saved'
    case 'error': return `Error: ${state.saveStatus.message}`
    case 'idle': return state.dirtyPaths.length > 0 ? `${state.dirtyPaths.length} unsaved` : 'Saved'
  }
}
