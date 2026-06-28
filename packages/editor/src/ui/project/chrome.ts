import type { PrimaryView } from '../../project/actions'
import type { ProjectCommand } from '@automata/project'
import type { ProjectEditorCore } from '../../project/host'
import type { ProjectEditorState } from '../../project/store'
import { injectTheme } from '../theme.css'
import { createViewportRegion } from '../viewportRegion'
import { mountProjectHierarchy } from './hierarchy'
import { mountProjectInspector } from './inspector'
import { mountProjectPalette } from './palette'
import { mountProjectResources } from './resources'
import { mountProjectToolbar } from './toolbar'
import { mountProjectValidation } from './validation'

/**
 * The generic project editor chrome. Reuses the docked shell + dual viewport,
 * replaces the legacy Outliner with the Hierarchy + Resources panels, keeps the
 * schema inspector in the right column, and exposes stable `data-*` selectors.
 * `renderEditorChrome` stays untouched; this is mounted alongside it until the
 * final cutover.
 */
export interface ProjectChromeOptions {
  onSave?: () => void
  onExport?: () => void
  onImport?: () => void
  onSwitchProject?: () => void
  confirmDelete?: (entityIds: string[]) => boolean
  /** Reports the active placement prefab so the host can place it on canvas clicks. */
  onSelectPrefab?: (prefabId: string | null) => void
  /** Optional AI panel mount in the right column. */
  mountAgentPanel?: (core: ProjectEditorCore, host: HTMLElement) => { update(state: ProjectEditorState): void; dispose(): void }
}

export interface ProjectChromeHandle {
  dispose(): void
}

interface ProjectPanel {
  update(state: ProjectEditorState): void
  dispose(): void
}

export function renderProjectChrome(
  core: ProjectEditorCore,
  root: HTMLElement,
  canvases: Record<PrimaryView, HTMLCanvasElement>,
  options: ProjectChromeOptions = {}
): ProjectChromeHandle {
  const region = (className: string): HTMLDivElement => {
    const div = document.createElement('div')
    div.className = className
    return div
  }

  const removeTheme = injectTheme(root.ownerDocument ?? document)
  const shell = region('ed-root')
  const toolbarHost = region('ed-toolbar-host')
  const body = region('ed-body')
  const paletteHost = region('ed-palette-host')
  const viewportHost = region('ed-viewport')
  const rightcol = region('ed-rightcol')
  const inspectorHost = region('ed-inspector-host')
  const hierarchyHost = region('ed-hierarchy-host')
  const resourcesHost = region('ed-resources-host')
  const validationHost = region('ed-validation-host')

  rightcol.append(inspectorHost, hierarchyHost, resourcesHost, validationHost)
  body.append(paletteHost, viewportHost, rightcol)
  shell.append(toolbarHost, body)
  root.append(shell)

  const dispatch = core.store.dispatch
  const command = (next: ProjectCommand): void => dispatch({ type: 'projectCommand', command: next })

  const toolbar = mountProjectToolbar(toolbarHost, {
    dispatch,
    callbacks: {
      onSwitchProject: options.onSwitchProject,
      onSave: options.onSave,
      onExport: options.onExport,
      onImport: options.onImport,
      onPlay: () => core.enterPlay(),
      onStop: () => core.exitPlay()
    }
  })
  const palette = mountProjectPalette(paletteHost, { dispatch: command, onSelectPrefab: options.onSelectPrefab ?? (() => {}) })
  const inspector = mountProjectInspector(inspectorHost, { dispatch: command })
  const hierarchy = mountProjectHierarchy(hierarchyHost, { dispatch, confirmDelete: options.confirmDelete })
  const resources = mountProjectResources(resourcesHost, { dispatch })
  const validation = mountProjectValidation(validationHost, { dispatch })

  const viewport = createViewportRegion(viewportHost, canvases, {
    setPrimaryView: (view) => dispatch({ type: 'setPrimaryView', view }),
    toggleInset: () => dispatch({ type: 'toggleInset' })
  })

  const panels: ProjectPanel[] = [toolbar, palette, hierarchy, resources, validation]
  let agent: ProjectPanel | undefined
  if (options.mountAgentPanel) {
    const chatHost = region('ed-chat-host')
    rightcol.append(chatHost)
    agent = options.mountAgentPanel(core, chatHost)
    panels.push(agent)
  }

  const update = (): void => {
    const state = core.store.getState()
    for (const panel of panels) panel.update(state)
    inspector.update({ registration: state.registration, snapshot: state.snapshot, selection: state.selection })
    viewport.update({ primaryView: state.primaryView, insetVisible: state.insetVisible })
  }
  const unsubscribe = core.store.subscribe(update)
  update()

  return {
    dispose() {
      unsubscribe()
      for (const panel of panels) panel.dispose()
      inspector.dispose()
      viewport.dispose()
      shell.remove()
      removeTheme()
    }
  }
}
