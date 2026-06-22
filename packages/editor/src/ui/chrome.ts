import type { EditorCore } from '../host'
import type { PrimaryView } from '../state/ui'
import { mountInspector } from './inspectorView'
import { mountMenuBar } from './menubar'
import { mountOutliner } from './outliner'
import { mountPalette } from './palette'
import { mountStatusBar } from './statusbar'
import { injectTheme } from './theme.css'
import { mountToolbar } from './toolbar'
import { mountChatOverlay } from './chatOverlay'
import { mountViewportRegion } from './viewportRegion'

export interface EditorChromeHandle {
  setCursorReadout(coords: { x: number; z: number } | null): void
  dispose(): void
}

export function renderEditorChrome<Doc>(
  core: EditorCore<Doc>,
  root: HTMLElement,
  canvases: Record<PrimaryView, HTMLCanvasElement>
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
  const chatHost = region('ed-chat-host')
  const statusHost = region('ed-statusbar-host')

  rightcol.append(inspectorHost, outlinerHost, chatHost)
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
    mountChatOverlay(core, chatHost),
    mountViewportRegion(core, viewportHost, canvases)
  ]
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
