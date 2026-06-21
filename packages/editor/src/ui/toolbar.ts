import type { EditorCore } from '../host'
import { exportDoc } from '../io/exportDoc'
import type { EditorState } from '../state/store'
import type { PanelHandle } from './panel'

/** Play/Edit toggle + Import/Export, mounted in chrome; file IO is supplied by host hooks. */
export function mountToolbar<Doc>(core: EditorCore<Doc>, parent: HTMLElement): PanelHandle<Doc> {
  const bar = document.createElement('div')
  bar.className = 'ed-toolbar'
  parent.append(bar)

  const button = (action: string, label: string): HTMLButtonElement => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'ed-tool'
    el.dataset.action = action
    el.textContent = label
    bar.append(el)
    return el
  }

  const play = button('play', 'Play')
  const importBtn = button('import', 'Import')
  const exportBtn = button('export', 'Export')
  const status = document.createElement('span')
  status.className = 'ed-toolbar-status'
  status.dataset.exportStatus = ''
  bar.append(status)

  play.addEventListener('click', () => {
    try {
      if (core.store.getState().mode === 'edit') core.enterPlay()
      else core.exitPlay()
      update(core.store.getState())
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error)
    }
  })

  importBtn.addEventListener('click', () => core.onImportRequest?.())

  exportBtn.addEventListener('click', () => {
    const result = exportDoc(core.definition, core.store.getState().document.doc)
    status.textContent = result.ok ? `Exported ${result.json.length} bytes` : result.issues.join(' * ')
    core.onExport?.(result)
  })

  function update(state: EditorState<Doc>): void {
    play.textContent = state.mode === 'play' ? 'Edit' : 'Play'
    play.classList.toggle('is-active', state.mode === 'play')
  }

  update(core.store.getState())
  return {
    update,
    dispose() {
      bar.remove()
    }
  }
}
