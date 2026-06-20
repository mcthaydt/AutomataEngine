import type { EditorCore } from '../host'
import type { EditorState } from '../state/store'
import { brushOf, missingRequired } from '../tools/cardinality'
import type { PanelHandle } from './panel'

export function mountOutliner<Doc>(core: EditorCore<Doc>, parent: HTMLElement): PanelHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-panel ed-outliner'
  parent.append(root)

  function update(state: EditorState<Doc>): void {
    root.replaceChildren()
    const head = document.createElement('div')
    head.className = 'ed-panel-head'
    head.textContent = 'Outliner'
    root.append(head)

    const items = core.definition.scene.listItems(state.document.doc)
    const missing = missingRequired(core.definition, items)
    if (missing.length > 0) {
      const warn = document.createElement('div')
      warn.className = 'ed-warn'
      warn.dataset.warn = ''
      warn.textContent = `Missing: ${missing.join(', ')}`
      root.append(warn)
    }

    const list = document.createElement('div')
    list.className = 'ed-item-list'
    root.append(list)
    for (const item of items) {
      const row = document.createElement('div')
      row.className = 'ed-item'
      row.dataset.item = item.id
      row.classList.toggle('is-selected', state.selection.includes(item.id))

      const label = document.createElement('button')
      label.type = 'button'
      label.className = 'ed-item-label'
      label.textContent = brushOf(core.definition, item)?.label ?? item.kind
      label.addEventListener('click', () => core.store.dispatch({ type: 'select', ids: [item.id] }))

      const del = document.createElement('button')
      del.type = 'button'
      del.className = 'ed-item-del'
      del.dataset.del = item.id
      del.title = 'Delete'
      del.textContent = '×'
      del.addEventListener('click', () => {
        core.store.dispatch({ type: 'select', ids: [item.id] })
        core.deleteSelected()
      })

      row.append(label, del)
      list.append(row)
    }
  }

  update(core.store.getState())
  return {
    update,
    dispose() { root.remove() }
  }
}
