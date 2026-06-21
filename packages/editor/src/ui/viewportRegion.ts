import type { EditorCore } from '../host'
import type { EditorState } from '../state/store'
import type { PrimaryView } from '../state/ui'
import type { PanelHandle } from './panel'

const other = (view: PrimaryView): PrimaryView => (view === '2d' ? '3d' : '2d')

export function mountViewportRegion<Doc>(
  core: EditorCore<Doc>,
  parent: HTMLElement,
  canvases: Record<PrimaryView, HTMLCanvasElement>
): PanelHandle<Doc> {
  const main = document.createElement('div')
  main.className = 'ed-vp-main'
  main.dataset.vp = 'main'

  const inset = document.createElement('div')
  inset.className = 'ed-vp-inset'
  inset.dataset.vp = 'inset'

  const swap = document.createElement('button')
  swap.type = 'button'
  swap.className = 'ed-vp-swap'
  swap.dataset.vpSwap = ''
  swap.textContent = '⇄'
  const hide = document.createElement('button')
  hide.type = 'button'
  hide.className = 'ed-vp-hide'
  hide.dataset.vpHide = ''
  hide.textContent = '×'
  inset.append(swap, hide)
  parent.append(main, inset)

  for (const canvas of Object.values(canvases)) canvas.classList.add('ed-vp-canvas')

  swap.addEventListener('click', (event) => {
    event.stopPropagation()
    core.store.dispatch({ type: 'setPrimaryView', view: other(core.store.getState().ui.primaryView) })
  })
  hide.addEventListener('click', (event) => {
    event.stopPropagation()
    core.store.dispatch({ type: 'toggleInset' })
  })

  function update(state: EditorState<Doc>): void {
    const primary = state.ui.primaryView
    const primaryCanvas = canvases[primary]
    const insetCanvas = canvases[other(primary)]
    if (primaryCanvas.parentElement !== main) main.insertBefore(primaryCanvas, main.firstChild)
    if (insetCanvas.parentElement !== inset) inset.insertBefore(insetCanvas, inset.firstChild)
    inset.classList.toggle('is-hidden', !state.ui.insetVisible)
    main.dataset.view = primary
    inset.dataset.view = other(primary)
  }

  update(core.store.getState())
  return {
    update,
    dispose() {
      main.remove()
      inset.remove()
    }
  }
}
