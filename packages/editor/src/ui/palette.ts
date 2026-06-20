import type { EditorCore } from '../host'
import type { Brush } from '../model/types'
import type { EditorState } from '../state/store'
import type { PanelHandle } from './panel'

export function mountPalette<Doc>(core: EditorCore<Doc>, parent: HTMLElement): PanelHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-palette'
  parent.append(root)

  const selectBtn = document.createElement('button')
  selectBtn.type = 'button'
  selectBtn.className = 'ed-tool'
  selectBtn.dataset.tool = 'select'
  selectBtn.textContent = 'Select'
  selectBtn.title = 'Select (Q)'
  selectBtn.addEventListener('click', () =>
    core.store.dispatch({ type: 'setTool', tool: { brushId: null, mode: 'select' } }))
  root.append(selectBtn)

  const groups: Array<[string, Brush[]]> = [
    ['Geometry', core.definition.palette.geometry],
    ['Markers', [...core.definition.palette.archetypes, ...core.definition.palette.markers]]
  ]
  const brushButtons = new Map<string, HTMLButtonElement>()
  for (const [label, brushes] of groups) {
    if (brushes.length === 0) continue
    const head = document.createElement('div')
    head.className = 'ed-group-label'
    head.textContent = label
    root.append(head)
    for (const brush of brushes) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ed-tool'
      btn.dataset.brush = brush.id
      btn.textContent = brush.label
      btn.addEventListener('click', () =>
        core.store.dispatch({ type: 'setTool', tool: { brushId: brush.id, mode: 'place' } }))
      brushButtons.set(brush.id, btn)
      root.append(btn)
    }
  }

  function update(state: EditorState<Doc>): void {
    const { brushId, mode } = state.tool.selection
    const selectOn = mode === 'select'
    selectBtn.classList.toggle('is-active', selectOn)
    selectBtn.setAttribute('aria-pressed', String(selectOn))
    for (const [id, btn] of brushButtons) {
      const on = mode === 'place' && brushId === id
      btn.classList.toggle('is-active', on)
      btn.setAttribute('aria-pressed', String(on))
    }
  }

  update(core.store.getState())
  return {
    update,
    dispose() { root.remove() }
  }
}
