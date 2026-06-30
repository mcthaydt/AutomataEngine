import type { PrimaryView } from '../project/actions'

const other = (view: PrimaryView): PrimaryView => (view === '2d' ? '3d' : '2d')

/** The minimal viewport UI state shared by project chrome layouts. */
export interface ViewportRegionView {
  primaryView: PrimaryView
  insetVisible: boolean
}

/** Dispatch surface the region needs; satisfied by either store. */
export interface ViewportRegionController {
  setPrimaryView(view: PrimaryView): void
  toggleInset(): void
}

export interface ViewportRegionHandle {
  update(view: ViewportRegionView): void
  dispose(): void
}

/**
 * Store-shape-agnostic dual-viewport region (main + swappable inset).
 */
export function createViewportRegion(
  parent: HTMLElement,
  canvases: Record<PrimaryView, HTMLCanvasElement>,
  controller: ViewportRegionController
): ViewportRegionHandle {
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
    controller.setPrimaryView(other(currentPrimary))
  })
  hide.addEventListener('click', (event) => {
    event.stopPropagation()
    controller.toggleInset()
  })

  let currentPrimary: PrimaryView = '2d'

  return {
    update(view) {
      currentPrimary = view.primaryView
      const primaryCanvas = canvases[view.primaryView]
      const insetCanvas = canvases[other(view.primaryView)]
      if (primaryCanvas.parentElement !== main) main.insertBefore(primaryCanvas, main.firstChild)
      if (insetCanvas.parentElement !== inset) inset.insertBefore(insetCanvas, inset.firstChild)
      inset.classList.toggle('is-hidden', !view.insetVisible)
      main.dataset.view = view.primaryView
      inset.dataset.view = other(view.primaryView)
    },
    dispose() {
      main.remove()
      inset.remove()
    }
  }
}
