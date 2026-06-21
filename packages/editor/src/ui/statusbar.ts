import type { EditorCore } from '../host'
import { validateDoc } from '../io/validation'
import type { EditorState } from '../state/store'
import type { PanelHandle } from './panel'

const SNAPS = [0.25, 0.5, 1, 0]
const snapLabel = (s: number): string => (s > 0 ? String(s) : 'off')

export interface StatusBarHandle<Doc> extends PanelHandle<Doc> {
  setCursor(coords: { x: number; z: number } | null): void
}

export function mountStatusBar<Doc>(core: EditorCore<Doc>, parent: HTMLElement): StatusBarHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-statusbar'
  parent.append(root)

  const cell = (cls: string): HTMLSpanElement => {
    const span = document.createElement('span')
    span.className = `ed-status-cell ${cls}`
    return span
  }

  const coords = cell('ed-status-coords')
  coords.textContent = 'x —  z —'
  const snap = document.createElement('button')
  snap.type = 'button'
  snap.className = 'ed-status-cell ed-snap'
  snap.dataset.snap = ''
  const selection = cell('ed-status-sel')
  const valid = cell('ed-status-valid')
  valid.dataset.valid = ''
  const tool = cell('ed-status-tool')
  root.append(coords, snap, selection, valid, tool)

  snap.addEventListener('click', () => {
    const current = core.store.getState().ui.snap
    const index = SNAPS.indexOf(current)
    const next = SNAPS[(index + 1) % SNAPS.length] ?? 0.5
    core.store.dispatch({ type: 'setSnap', snap: next })
  })

  function setCursor(value: { x: number; z: number } | null): void {
    coords.textContent = value ? `x ${value.x.toFixed(2)}  z ${value.z.toFixed(2)}` : 'x —  z —'
  }

  function update(state: EditorState<Doc>): void {
    snap.textContent = `snap ${snapLabel(state.ui.snap)}`
    selection.textContent = `${state.selection.length} selected`
    const result = validateDoc(core.definition, state.document.doc)
    valid.textContent = result.exportable ? '✓ Valid' : result.issues.join(' · ')
    valid.classList.toggle('is-invalid', !result.exportable)
    const { brushId, mode } = state.tool.selection
    tool.textContent = mode === 'place' ? `Place: ${brushId ?? '—'}` : 'Select'
  }

  update(core.store.getState())
  return {
    update,
    setCursor,
    dispose() { root.remove() }
  }
}
