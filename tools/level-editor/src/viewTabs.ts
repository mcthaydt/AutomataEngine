export type EditorViewId = '3d' | '2d'

export interface EditorView {
  id: EditorViewId
  label: string
  canvas: HTMLCanvasElement
}

export interface ViewTabsOptions {
  initialView: EditorViewId
  views: EditorView[]
  onChange?: (view: EditorViewId) => void
}

export interface ViewTabs {
  activeView(): EditorViewId
  setActiveView(view: EditorViewId): void
  dispose(): void
}

/** Creates the editor's mutually-exclusive 3D/2D canvas tabs. */
export function createViewTabs(host: HTMLElement, options: ViewTabsOptions): ViewTabs {
  const tabHost = document.createElement('div')
  tabHost.id = 'view-tabs'
  tabHost.setAttribute('role', 'tablist')

  const buttons = new Map<EditorViewId, HTMLButtonElement>()
  let active = options.initialView

  const setActiveView = (view: EditorViewId): void => {
    if (active === view) return
    active = view
    sync()
    options.onChange?.(view)
  }

  for (const view of options.views) {
    view.canvas.classList.add('view-canvas', `view-${view.id}`)
    view.canvas.dataset.view = view.id

    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = view.label
    button.dataset.viewTab = view.id
    button.setAttribute('role', 'tab')
    button.addEventListener('click', () => setActiveView(view.id))
    buttons.set(view.id, button)
    tabHost.append(button)
  }

  const sync = (): void => {
    for (const view of options.views) {
      const selected = view.id === active
      view.canvas.hidden = !selected
      view.canvas.classList.toggle('is-active', selected)
      buttons.get(view.id)?.setAttribute('aria-pressed', String(selected))
      buttons.get(view.id)?.setAttribute('aria-selected', String(selected))
    }
  }

  const api: ViewTabs = {
    activeView: () => active,
    setActiveView,
    dispose() {
      tabHost.remove()
    }
  }

  host.append(tabHost)
  sync()
  return api
}
