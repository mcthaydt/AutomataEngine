import type { EditorCore } from '../host'
import type { PrimaryView } from '../state/ui'
import { mountInspector } from './inspectorView'
import { mountMenuBar } from './menubar'
import { mountOutliner } from './outliner'
import { mountPalette } from './palette'
import { mountStatusBar } from './statusbar'
import { injectTheme } from './theme.css'
import { mountToolbar } from './toolbar'
import { mountViewportRegion } from './viewportRegion'
import type { PanelHandle } from './panel'

export interface EditorChromeHandle {
  setCursorReadout(coords: { x: number; z: number } | null): void
  dispose(): void
}

export interface EditorChromeOptions<Doc> {
  /** When provided, chrome mounts an agent panel in the right column; otherwise none exists. */
  mountAgentPanel?: (core: EditorCore<Doc>, host: HTMLElement) => PanelHandle<Doc>
}

export function renderEditorChrome<Doc>(
  core: EditorCore<Doc>,
  root: HTMLElement,
  canvases: Record<PrimaryView, HTMLCanvasElement>,
  opts: EditorChromeOptions<Doc> = {}
): EditorChromeHandle {
  const region = (cls: string): HTMLDivElement => {
    const div = document.createElement('div')
    div.className = cls
    return div
  }

  const removeTheme = injectTheme(root.ownerDocument ?? document)
  const shell = region('ed-root')
  const menubarHost = region('ed-menubar-host')
  const toolbarHost = region('ed-toolbar-host')
  const body = region('ed-body')
  const paletteHost = region('ed-palette-host')
  const viewportHost = region('ed-viewport')
  const rightcol = region('ed-rightcol')
  const inspectorHost = region('ed-inspector-host')
  const outlinerHost = region('ed-outliner-host')
  const statusHost = region('ed-statusbar-host')

  rightcol.append(inspectorHost, outlinerHost)
  body.append(paletteHost, viewportHost, rightcol)
  shell.append(menubarHost, body, statusHost)
  root.append(shell)

  const menubar = mountMenuBar(core, menubarHost)
  menubarHost.append(toolbarHost)
  const panels = [
    menubar,
    mountToolbar(core, toolbarHost),
    mountPalette(core, paletteHost),
    mountInspector(core, inspectorHost),
    mountOutliner(core, outlinerHost),
    mountViewportRegion(core, viewportHost, canvases)
  ]
  if (opts.mountAgentPanel) {
    const chatHost = region('ed-chat-host')
    rightcol.append(chatHost)
    panels.push(opts.mountAgentPanel(core, chatHost))
  }
  const status = mountStatusBar(core, statusHost)

  const unsubscribe = core.store.subscribe(() => {
    const state = core.store.getState()
    for (const panel of panels) panel.update(state)
    status.update(state)
  })

  return {
    setCursorReadout: (coords) => status.setCursor(coords),
    dispose() {
      unsubscribe()
      for (const panel of panels) panel.dispose()
      status.dispose()
      shell.remove()
      removeTheme()
    }
  }
}
