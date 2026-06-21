import type { EditorCore } from '../host'
import type { EditorState } from '../state/store'
import type { PanelHandle } from './panel'

interface MenuItem {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  run: () => void
}

const SNAP_ORDER = [0.25, 0.5, 1, 0]

export function mountMenuBar<Doc>(core: EditorCore<Doc>, parent: HTMLElement): PanelHandle<Doc> {
  const root = document.createElement('div')
  root.className = 'ed-menubar'
  parent.append(root)
  const store = core.store
  const itemEls = new Map<string, HTMLButtonElement>()

  const menus: Array<{ title: string; items: MenuItem[] }> = [
    {
      title: 'File',
      items: [
        { id: 'new', label: 'New', run: () => store.dispatch({ type: 'loadDoc', doc: core.definition.scene.emptyDoc() }) },
        { id: 'import', label: 'Import...', disabled: true, run: () => {} },
        { id: 'export', label: 'Export...', disabled: true, run: () => {} }
      ]
    },
    {
      title: 'Edit',
      items: [
        { id: 'undo', label: 'Undo', shortcut: '⌘Z', run: () => store.dispatch({ type: 'undo' }) },
        { id: 'redo', label: 'Redo', shortcut: '⇧⌘Z', run: () => store.dispatch({ type: 'redo' }) },
        { id: 'delete', label: 'Delete', shortcut: '⌫', run: () => core.deleteSelected() }
      ]
    },
    {
      title: 'View',
      items: [
        {
          id: 'swap',
          label: 'Swap viewports',
          shortcut: 'Tab',
          run: () => {
            const view = store.getState().ui.primaryView
            store.dispatch({ type: 'setPrimaryView', view: view === '2d' ? '3d' : '2d' })
          }
        },
        { id: 'inset', label: 'Toggle inset', shortcut: '\\', run: () => store.dispatch({ type: 'toggleInset' }) },
        {
          id: 'snap',
          label: 'Cycle snap',
          run: () => {
            const index = SNAP_ORDER.indexOf(store.getState().ui.snap)
            store.dispatch({ type: 'setSnap', snap: SNAP_ORDER[(index + 1) % SNAP_ORDER.length] ?? 0.5 })
          }
        }
      ]
    }
  ]

  for (const menu of menus) {
    const col = document.createElement('div')
    col.className = 'ed-menu'
    const title = document.createElement('button')
    title.type = 'button'
    title.className = 'ed-menu-title'
    title.textContent = menu.title
    title.addEventListener('click', () => col.classList.toggle('is-open'))
    const drop = document.createElement('div')
    drop.className = 'ed-menu-drop'
    for (const item of menu.items) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ed-menu-item'
      btn.dataset.menuItem = item.id
      btn.textContent = item.label
      if (item.shortcut) {
        const sc = document.createElement('span')
        sc.className = 'ed-menu-sc'
        sc.textContent = item.shortcut
        btn.append(sc)
      }
      btn.disabled = Boolean(item.disabled)
      btn.addEventListener('click', () => {
        if (btn.disabled) return
        item.run()
        col.classList.remove('is-open')
      })
      itemEls.set(item.id, btn)
      drop.append(btn)
    }
    col.append(title, drop)
    root.append(col)
  }

  function update(state: EditorState<Doc>): void {
    const undo = itemEls.get('undo')
    if (undo) undo.disabled = state.document.past.length === 0
    const redo = itemEls.get('redo')
    if (redo) redo.disabled = state.document.future.length === 0
    const del = itemEls.get('delete')
    if (del) del.disabled = state.selection.length === 0
  }

  update(store.getState())
  return {
    update,
    dispose() { root.remove() }
  }
}
