import {
  GameLoop,
  createCleanupStack,
  createRapierPhysics,
  createThreeRenderer,
  type StoragePort
} from '@automata/engine'
import { attachCanvasRenderer, startLoopDriver } from '@automata/engine/browser'
import {
  createProjectEditor,
  installProjectAutosave,
  loadProjectAutosave,
  type ProjectStoragePort,
  type RegisteredEditorProject
} from '@automata/editor'
import { injectTheme, renderProjectChrome } from '@automata/editor/ui'
import {
  attachFlyControls,
  buildRay,
  EDITOR_FOV_Y,
  paintMap,
  rayPlaneY,
  screenToWorldXZ,
  type ScreenSize
} from '@automata/editor/viewport'
import { applyGameMigration, PROJECT_FORMAT_VERSION, stringifyProjectBundle, toProjectBundle, type ProjectSnapshot } from '@automata/project'
import type { BrowserWorkspace, OpenedBrowserProject } from './browserWorkspace'
import type { ProjectCatalog } from './projectCatalog'

export type DirtyAction = 'save' | 'export' | 'discard' | 'cancel'

export interface ProjectSessionHandle {
  readonly canSave: boolean
  hasUnsavedChanges(): boolean
  save(): Promise<boolean>
  exportBundle(): void
  dispose(): void
}

export interface ProjectSessionMountOptions {
  root: HTMLElement
  registration: RegisteredEditorProject
  snapshot: ProjectSnapshot
  storage: ProjectStoragePort | null
  autosaveStorage: StoragePort
  workspace: BrowserWorkspace
  initiallyDirty?: boolean
  /** True when the project was migrated on load; every path starts dirty. */
  migrated?: boolean
  onPersisted?: () => void
  onSwitchProject(): Promise<void>
}

export type ProjectSessionFactory = (
  options: ProjectSessionMountOptions
) => Promise<ProjectSessionHandle>

export interface EditorAppOptions {
  root: HTMLElement
  catalog: ProjectCatalog
  workspace: BrowserWorkspace
  autosaveStorage: StoragePort
  query: string
  createSession?: ProjectSessionFactory
  chooseDirtyAction?: (canSave: boolean) => Promise<DirtyAction>
}

export interface EditorAppHandle {
  hasUnsavedChanges(): boolean
  dispose(): void
}

/** Own the chooser/session state machine for the one multi-game editor app. */
export async function mountEditorApp(options: EditorAppOptions): Promise<EditorAppHandle> {
  const createSession = options.createSession ?? mountProjectSession
  const query = new URLSearchParams(options.query)
  const requestedGame = query.get('game')
  const requestedProject = query.get('project')
  let session: ProjectSessionHandle | null = null
  let disposed = false
  let chooserGeneration = 0
  const removeTheme = injectTheme(options.root.ownerDocument ?? document)

  const showError = (message: string): void => {
    const node = options.root.querySelector<HTMLElement>('[data-chooser-error]')
    if (node) node.textContent = message
  }

  const resolveRegistration = (snapshot: ProjectSnapshot): RegisteredEditorProject => {
    const registration = options.catalog.get(snapshot.manifest.gameId)
    if (!registration) {
      throw new Error(
        `Unknown project game "${snapshot.manifest.gameId}". Available: ${options.catalog.list().map((item) => item.gameId).join(', ')}`
      )
    }
    return registration
  }

  const openSession = async (
    registration: RegisteredEditorProject,
    snapshot: ProjectSnapshot,
    storage: ProjectStoragePort | null,
    fromVersion: number = PROJECT_FORMAT_VERSION
  ): Promise<void> => {
    if (disposed) return
    const errors = registration.validate(snapshot).filter((issue) => issue.severity === 'error')
    if (errors.length > 0) {
      throw new Error(`Project validation failed: ${errors.map((issue) => issue.code).join(', ')}`)
    }
    options.root.replaceChildren()
    session = await createSession({
      root: options.root,
      registration,
      snapshot,
      storage,
      autosaveStorage: options.autosaveStorage,
      workspace: options.workspace,
      initiallyDirty: false,
      migrated: fromVersion < PROJECT_FORMAT_VERSION,
      onSwitchProject: requestChooser
    })
  }

  const openWorkspace = async (opened: OpenedBrowserProject | null): Promise<void> => {
    if (!opened) return
    const registration = resolveRegistration(opened.snapshot)
    const snapshot = applyGameMigration(opened, registration.project.migrate)
    await openSession(registration, snapshot, opened.storage, opened.fromVersion)
  }

  const openWithErrorBoundary = async (operation: () => Promise<void>): Promise<void> => {
    try {
      await operation()
    } catch (error) {
      if (!disposed) {
        const message = messageOf(error)
        if (options.root.querySelector('[data-chooser-error]')) showError(message)
        else await renderChooser(message)
      }
    }
  }

  const renderChooser = async (initialError = ''): Promise<void> => {
    const generation = ++chooserGeneration
    options.root.replaceChildren()
    const chooser = document.createElement('section')
    chooser.className = 'ed-root ed-project-chooser'
    chooser.dataset.projectChooser = ''
    const content = document.createElement('div')
    content.className = 'ed-chooser-content'
    const heading = document.createElement('h1')
    heading.textContent = 'Automata Project Editor'
    const error = document.createElement('p')
    error.dataset.chooserError = ''
    error.className = 'ed-chooser-error'
    error.textContent = initialError
    content.append(heading, error)

    const createGroup = document.createElement('div')
    createGroup.className = 'ed-chooser-games'
    for (const registration of options.catalog.list()) {
      const button = actionButton(`Create ${registration.label} Project`, () => {
        void openWithErrorBoundary(() => openSession(
          registration,
          registration.createTemplate(),
          null
        ))
      })
      button.dataset.createGame = registration.gameId
      if (requestedGame === registration.gameId) button.dataset.preselected = 'true'
      createGroup.append(button)
    }

    const open = actionButton('Open Project', () => {
      void openWithErrorBoundary(async () => openWorkspace(await options.workspace.open()))
    })
    open.dataset.openProject = ''
    content.append(createGroup, open)

    const recentHost = document.createElement('div')
    recentHost.dataset.recentProjects = ''
    content.append(recentHost)
    chooser.append(content)
    options.root.append(chooser)

    const recent = await options.workspace.listRecent()
    if (disposed || generation !== chooserGeneration) return
    for (const entry of recent) {
      const button = actionButton(`Open ${entry.name}`, () => {
        void openWithErrorBoundary(async () => openWorkspace(
          await options.workspace.openRecent(entry.projectId)
        ))
      })
      button.dataset.recentProject = entry.projectId
      recentHost.append(button)
    }
  }

  async function requestChooser(): Promise<void> {
    if (!session) {
      await renderChooser()
      return
    }
    if (session.hasUnsavedChanges()) {
      const action = await (options.chooseDirtyAction?.(session.canSave) ?? chooseDirtyAction(options.root, session.canSave))
      if (action === 'cancel') return
      if (action === 'save' && !(await session.save())) return
      if (action === 'export') session.exportBundle()
    }
    session.dispose()
    session = null
    await renderChooser()
  }

  let initialError = ''
  if (requestedGame && !options.catalog.get(requestedGame)) {
    initialError = `Unknown game "${requestedGame}"`
  }
  await renderChooser(initialError)
  if (requestedProject) {
    await openWithErrorBoundary(async () => {
      const opened = await options.workspace.openRecent(requestedProject)
      if (!opened) throw new Error(`Recent project "${requestedProject}" is unavailable`)
      await openWorkspace(opened)
    })
  }

  return {
    hasUnsavedChanges: () => session?.hasUnsavedChanges() ?? false,
    dispose() {
      if (disposed) return
      disposed = true
      chooserGeneration++
      session?.dispose()
      session = null
      options.root.replaceChildren()
      removeTheme()
    }
  }
}

/** Mount one renderer/physics/editor session and own every acquired resource. */
export async function mountProjectSession(
  options: ProjectSessionMountOptions
): Promise<ProjectSessionHandle> {
  const cleanup = createCleanupStack()
  let forceDirty = options.initiallyDirty ?? false
  try {
    const canvas3d = document.createElement('canvas')
    const canvas2d = document.createElement('canvas')
    const renderer = createThreeRenderer()
    cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await attachCanvasRenderer(renderer, canvas3d, { sizeTo: 'element' })
    cleanup.defer(() => canvasRenderer.dispose())
    const physics = await createRapierPhysics()
    cleanup.defer(() => physics.dispose())

    const core = createProjectEditor({
      registration: options.registration,
      snapshot: options.snapshot,
      render: renderer.port,
      physics
    })
    cleanup.defer(() => core.dispose())
    if (options.migrated) core.store.dispatch({ type: 'markAllDirty' })

    // Recover newer in-memory work an earlier session autosaved but never persisted. Compare
    // canonically so a clean reopen (autosave == opened project) does not spuriously go dirty.
    const autosaved = loadProjectAutosave(options.autosaveStorage, options.snapshot.manifest.id)
    if (autosaved && stringifyProjectBundle(toProjectBundle(autosaved)) !== stringifyProjectBundle(toProjectBundle(options.snapshot))) {
      core.store.dispatch({ type: 'recoverSnapshot', snapshot: autosaved })
    }
    cleanup.defer(installProjectAutosave(core.store, options.autosaveStorage, { debounceMs: 400 }))

    let selectedPrefab: string | null = null
    let backingStorage = options.storage
    let saving = false
    const save = async (): Promise<boolean> => {
      if (!backingStorage || saving) return false // a folder write is in flight; don't race a second one
      saving = true
      try {
        return await runSave(backingStorage)
      } finally {
        saving = false
      }
    }
    const runSave = async (store: NonNullable<typeof backingStorage>): Promise<boolean> => {
      const state = core.store.getState()
      core.store.dispatch({ type: 'beginSave' })
      const result = await store.save(state.snapshot, state.dirtyPaths)
      if (result.saved.length > 0) core.store.dispatch({ type: 'markSaved', paths: result.saved, snapshot: state.snapshot })
      if (result.failed.length > 0) {
        core.store.dispatch({
          type: 'saveFailed',
          message: result.failed.map((failure) => `${failure.path}: ${failure.message}`).join('; '),
          paths: result.failed.map((failure) => failure.path)
        })
        return false
      }
      if (result.saved.length === 0) core.store.dispatch({ type: 'markSaved', paths: [], snapshot: state.snapshot })
      forceDirty = false
      options.onPersisted?.()
      return true
    }
    const exportBundle = (): void => {
      const exported = core.store.getState().snapshot
      options.workspace.exportBundle(options.registration, exported)
      // Only a bundle-mode export (no folder behind it) counts as durable persistence; a
      // folder-backed export is a side artifact and must not clear the folder's dirty state.
      if (backingStorage) {
        core.store.dispatch({ type: 'markExported' })
      } else {
        core.store.dispatch({ type: 'markExported', snapshot: exported })
        forceDirty = false
      }
      options.onPersisted?.()
    }
    const importBundle = async (): Promise<void> => {
      const opened = await options.workspace.importBundle(options.registration)
      if (!opened) return
      backingStorage = null
      core.store.dispatch({ type: 'loadSnapshot', snapshot: applyGameMigration(opened, options.registration.project.migrate) })
      if (opened.fromVersion < PROJECT_FORMAT_VERSION) core.store.dispatch({ type: 'markAllDirty' })
    }

    const chrome = renderProjectChrome(core, options.root, { '2d': canvas2d, '3d': canvas3d }, {
      onSwitchProject: () => { void options.onSwitchProject() },
      onSave: () => { void save() },
      // Re-checked on every render, so importing a bundle (which drops the folder) hides Save.
      canSave: () => Boolean(backingStorage?.capabilities.canSaveFolder),
      onExport: exportBundle,
      onImport: () => { void importBundle() },
      onSelectPrefab: (prefabId) => { selectedPrefab = prefabId }
    })
    cleanup.defer(() => chrome.dispose())
    const flyControls = attachFlyControls(canvas3d, () => core.camera, (camera) => { core.camera = camera })
    cleanup.defer(() => flyControls.dispose())

    const context2d = canvas2d.getContext('2d')
    if (!context2d) throw new Error('2D canvas context unavailable')
    const fit = (canvas: HTMLCanvasElement): ScreenSize => {
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.floor(rect.width))
      const h = Math.max(1, Math.floor(rect.height))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      return { w, h }
    }
    const measure = (canvas: HTMLCanvasElement): ScreenSize => {
      const rect = canvas.getBoundingClientRect()
      return { w: Math.max(1, Math.floor(rect.width)), h: Math.max(1, Math.floor(rect.height)) }
    }
    const sizeOf = (view: '2d' | '3d', canvas: HTMLCanvasElement): ScreenSize =>
      view === '2d' ? fit(canvas) : measure(canvas)
    const localScreen = (canvas: HTMLCanvasElement, event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const worldAt = (view: '2d' | '3d', screen: { x: number; y: number }, size: ScreenSize) => {
      if (view === '2d') {
        const xz = screenToWorldXZ(core.mapView, screen, size)
        return { x: xz.x, y: 0, z: xz.z }
      }
      return rayPlaneY(buildRay(core.camera, screen, size, EDITOR_FOV_Y), 0)
    }

    for (const [view, canvas] of [['2d', canvas2d], ['3d', canvas3d]] as const) {
      const onPointerDown = (event: PointerEvent): void => {
        if (core.store.getState().primaryView !== view) {
          core.store.dispatch({ type: 'setPrimaryView', view })
          return
        }
        const size = sizeOf(view, canvas)
        const screen = localScreen(canvas, event)
        const world = worldAt(view, screen, size)
        if (event.shiftKey) {
          if (world) core.moveSelectionTo(world)
        } else if (selectedPrefab) {
          if (world) core.placePrefabAt(selectedPrefab, world)
        } else if (view === '2d') {
          core.pick2d(screen, size)
        } else {
          core.pick3d(screen, size)
        }
      }
      canvas.addEventListener('pointerdown', onPointerDown)
      cleanup.defer(() => canvas.removeEventListener('pointerdown', onPointerDown))
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return // never hijack typing in inspector text fields
      const key = event.key.toLowerCase()
      if (event.key === 'Delete' || event.key === 'Backspace') core.deleteSelected()
      else if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault()
        core.store.dispatch(event.shiftKey ? { type: 'redo' } : { type: 'undo' })
      } else if (event.key === 'Tab') {
        event.preventDefault()
        const view = core.store.getState().primaryView
        core.store.dispatch({ type: 'setPrimaryView', view: view === '2d' ? '3d' : '2d' })
      } else if (event.key === '\\') {
        core.store.dispatch({ type: 'toggleInset' })
      } else if (event.key === 'Escape') {
        selectedPrefab = null
      }
    }
    window.addEventListener('keydown', onKeyDown)
    cleanup.defer(() => window.removeEventListener('keydown', onKeyDown))

    const loop = new GameLoop({
      fixedUpdate: (dt) => {
        flyControls.update(dt)
        core.fixedUpdate(dt)
      },
      render: (alpha, frameDt) => {
        core.tick(alpha, frameDt)
        canvasRenderer.renderFrame()
        const mapSize = fit(canvas2d)
        paintMap(context2d, core.drawModel(mapSize), mapSize)
      }
    })
    const loopDriver = startLoopDriver(loop)
    cleanup.defer(() => loopDriver.stop())

    return {
      get canSave() { return Boolean(backingStorage?.capabilities.canSaveFolder) },
      hasUnsavedChanges: () => forceDirty || core.store.getState().dirtyPaths.length > 0,
      save,
      exportBundle,
      dispose: () => cleanup.dispose()
    }
  } catch (error) {
    cleanup.dispose()
    throw error
  }
}

/** True when a keyboard event is being typed into an editable control, where editor shortcuts must not fire. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function actionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

function chooseDirtyAction(root: HTMLElement, canSave: boolean): Promise<DirtyAction> {
  return new Promise((resolve) => {
    const dialog = document.createElement('div')
    dialog.className = 'ed-dirty-dialog'
    dialog.dataset.dirtyDialog = ''
    const message = document.createElement('p')
    message.textContent = 'This project has unsaved changes.'
    dialog.append(message)
    const finish = (action: DirtyAction): void => {
      dialog.remove()
      resolve(action)
    }
    if (canSave) dialog.append(actionButton('Save', () => finish('save')))
    dialog.append(
      actionButton('Export', () => finish('export')),
      actionButton('Discard', () => finish('discard')),
      actionButton('Cancel', () => finish('cancel'))
    )
    root.append(dialog)
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
