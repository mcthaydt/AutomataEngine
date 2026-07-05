import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  core: null as null | ReturnType<typeof makeCore>,
  chromeOptions: null as null | Record<string, (...args: unknown[]) => unknown>,
  canvases: null as null | Record<'2d' | '3d', HTMLCanvasElement>,
  loopOptions: null as null | {
    fixedUpdate(dt: number): void
    render(alpha: number, frameDt: number): void
  },
  rendererDispose: vi.fn(),
  canvasDispose: vi.fn(),
  physicsDispose: vi.fn(),
  flyDispose: vi.fn(),
  loopStop: vi.fn(),
  autosaveDispose: vi.fn(),
  chromeDispose: vi.fn(),
  renderFrame: vi.fn(),
  flyUpdate: vi.fn(),
  loadAutosaveResult: null as unknown
}))

vi.mock('@automata/engine', () => ({
  GameLoop: class {
    constructor(options: typeof mocks.loopOptions) { mocks.loopOptions = options }
  },
  createCleanupStack: () => {
    const disposers: Array<() => void> = []
    return {
      defer(dispose: () => void) { disposers.push(dispose) },
      dispose() {
        while (disposers.length > 0) disposers.pop()!()
      }
    }
  },
  createRapierPhysics: vi.fn(async () => ({ dispose: mocks.physicsDispose })),
  createThreeRenderer: vi.fn(() => ({ port: { dispose: mocks.rendererDispose } }))
}))

vi.mock('@automata/engine/browser', () => ({
  attachCanvasRenderer: vi.fn(async () => ({
    dispose: mocks.canvasDispose,
    renderFrame: mocks.renderFrame
  })),
  startLoopDriver: vi.fn(() => ({ stop: mocks.loopStop }))
}))

vi.mock('@automata/editor', () => ({
  createProjectEditor: vi.fn(() => mocks.core),
  installProjectAutosave: vi.fn(() => mocks.autosaveDispose),
  loadProjectAutosave: vi.fn(() => mocks.loadAutosaveResult)
}))

vi.mock('@automata/editor/ui', () => ({
  renderProjectChrome: vi.fn((_core, _root, canvases, options) => {
    mocks.canvases = canvases
    mocks.chromeOptions = options
    return { dispose: mocks.chromeDispose }
  })
}))

vi.mock('@automata/editor/viewport', () => ({
  attachFlyControls: vi.fn(() => ({ update: mocks.flyUpdate, dispose: mocks.flyDispose })),
  buildRay: vi.fn(() => ({ origin: { x: 0, y: 1, z: 0 }, dir: { x: 0, y: -1, z: 0 } })),
  EDITOR_FOV_Y: 1,
  paintMap: vi.fn(),
  rayPlaneY: vi.fn(() => ({ x: 2, y: 0, z: 3 })),
  screenToWorldXZ: vi.fn(() => ({ x: 4, z: 5 }))
}))

import { mountProjectSession } from '../src/editorApp'

const snapshot = {
  manifest: {
    formatVersion: 2, id: 'test', name: 'Test', gameId: 'fake', entrySceneId: 'main',
    scenes: [{ id: 'main', path: 'scenes/main.scene.json' }], resources: []
  },
  scenes: { main: { id: 'main', name: 'Main', entities: [] } },
  resources: {}
}

function makeCore() {
  const state = {
    snapshot,
    dirtyPaths: ['scenes/main.scene.json'],
    primaryView: '2d' as '2d' | '3d',
    insetVisible: true,
    saveStatus: { kind: 'idle' }
  }
  const dispatch = vi.fn((action: { type: string; [key: string]: unknown }) => {
    if (action.type === 'markSaved') state.dirtyPaths = []
    if (action.type === 'markExported') state.dirtyPaths = []
    if (action.type === 'loadSnapshot') state.snapshot = action.snapshot as typeof snapshot
    if (action.type === 'setPrimaryView') state.primaryView = action.view as '2d' | '3d'
    if (action.type === 'toggleInset') state.insetVisible = !state.insetVisible
    if (action.type === 'saveFailed') state.saveStatus = { kind: 'error' }
  })
  return {
    store: { getState: () => state, dispatch },
    camera: {},
    mapView: {},
    fixedUpdate: vi.fn(),
    tick: vi.fn(),
    drawModel: vi.fn(() => []),
    moveSelectionTo: vi.fn(),
    placePrefabAt: vi.fn(),
    pick2d: vi.fn(),
    pick3d: vi.fn(),
    deleteSelected: vi.fn(),
    dispose: vi.fn()
  }
}

type OpenedBundle = { snapshot: typeof snapshot; storage: null; source: 'bundle' } | null

function workspace(imported = snapshot) {
  return {
    open: vi.fn(),
    openRecent: vi.fn(),
    importBundle: vi.fn(async (): Promise<OpenedBundle> => ({
      snapshot: imported, storage: null, source: 'bundle'
    })),
    listRecent: vi.fn(async () => []),
    exportBundle: vi.fn()
  }
}

interface SaveResult {
  saved: string[]
  failed: Array<{ path: string; message: string }>
}

function storage(
  save: (...args: unknown[]) => Promise<SaveResult> = vi.fn(async (): Promise<SaveResult> => ({
    saved: ['scenes/main.scene.json'], failed: []
  }))
) {
  return {
    capabilities: { canSaveFolder: true },
    open: vi.fn(),
    save
  }
}

const registration = {
  gameId: 'fake',
  project: {},
  validate: () => [],
  compile: () => ({}),
  prefabs: [],
  componentTypes: [],
  resourceTypes: []
}

describe('project browser session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.core = makeCore()
    mocks.chromeOptions = null
    mocks.canvases = null
    mocks.loopOptions = null
    mocks.loadAutosaveResult = null
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 80,
      width: 100, height: 80, toJSON: () => ({})
    })
  })

  it('owns save/export/import, input routing, loop work, and cleanup', async () => {
    const saveResult = vi.fn(async () => ({ saved: ['scenes/main.scene.json'], failed: [] }))
    const backing = storage(saveResult)
    const browserWorkspace = workspace(structuredClone(snapshot))
    const persisted = vi.fn()
    const switchProject = vi.fn(async () => {})
    const root = document.createElement('main')

    const session = await mountProjectSession({
      root,
      registration: registration as never,
      snapshot: snapshot as never,
      storage: backing as never,
      autosaveStorage: {} as never,
      workspace: browserWorkspace as never,
      initiallyDirty: true,
      onPersisted: persisted,
      onSwitchProject: switchProject
    })

    expect(session.canSave).toBe(true)
    expect(session.hasUnsavedChanges()).toBe(true)
    await expect(session.save()).resolves.toBe(true)
    expect(saveResult).toHaveBeenCalledWith(snapshot, ['scenes/main.scene.json'])
    expect(persisted).toHaveBeenCalledOnce()

    session.exportBundle()
    expect(browserWorkspace.exportBundle).toHaveBeenCalled()
    expect(session.hasUnsavedChanges()).toBe(false)

    mocks.chromeOptions!.onSwitchProject!()
    await vi.waitFor(() => expect(switchProject).toHaveBeenCalledOnce())
    mocks.chromeOptions!.onSelectPrefab!('box')

    const canvas2d = mocks.canvases!['2d']
    canvas2d.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 20 }))
    expect(mocks.core!.placePrefabAt).toHaveBeenCalledWith('box', { x: 4, y: 0, z: 5 })
    canvas2d.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 20, shiftKey: true }))
    expect(mocks.core!.moveSelectionTo).toHaveBeenCalled()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    canvas2d.dispatchEvent(new PointerEvent('pointerdown', { clientX: 1, clientY: 2 }))
    expect(mocks.core!.pick2d).toHaveBeenCalled()

    const canvas3d = mocks.canvases!['3d']
    canvas3d.dispatchEvent(new PointerEvent('pointerdown'))
    expect(mocks.core!.store.dispatch).toHaveBeenCalledWith({ type: 'setPrimaryView', view: '3d' })
    canvas3d.dispatchEvent(new PointerEvent('pointerdown'))
    expect(mocks.core!.pick3d).toHaveBeenCalled()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\' }))
    expect(mocks.core!.deleteSelected).toHaveBeenCalledOnce()
    expect(mocks.core!.store.dispatch).toHaveBeenCalledWith({ type: 'undo' })
    expect(mocks.core!.store.dispatch).toHaveBeenCalledWith({ type: 'redo' })
    expect(mocks.core!.store.dispatch).toHaveBeenCalledWith({ type: 'toggleInset' })

    mocks.loopOptions!.fixedUpdate(1 / 60)
    mocks.loopOptions!.render(0.5, 1 / 60)
    expect(mocks.flyUpdate).toHaveBeenCalled()
    expect(mocks.core!.fixedUpdate).toHaveBeenCalled()
    expect(mocks.core!.tick).toHaveBeenCalled()
    expect(mocks.renderFrame).toHaveBeenCalled()

    mocks.chromeOptions!.onImport!()
    await vi.waitFor(() => expect(browserWorkspace.importBundle).toHaveBeenCalledOnce())
    expect(session.canSave).toBe(false)

    session.dispose()
    expect(mocks.loopStop).toHaveBeenCalledOnce()
    expect(mocks.chromeDispose).toHaveBeenCalledOnce()
    expect(mocks.core!.dispose).toHaveBeenCalledOnce()
    expect(mocks.rendererDispose).toHaveBeenCalledOnce()
  })

  it('marks every path dirty when mounted for a migrated project', async () => {
    const session = await mountProjectSession({
      root: document.createElement('main'),
      registration: registration as never,
      snapshot: snapshot as never,
      storage: null,
      autosaveStorage: {} as never,
      workspace: workspace() as never,
      migrated: true,
      onSwitchProject: async () => {}
    })

    expect(mocks.core!.store.dispatch).toHaveBeenCalledWith({ type: 'markAllDirty' })
    session.dispose()
  })

  it('does not mark paths dirty when mounted at the current format version', async () => {
    const session = await mountProjectSession({
      root: document.createElement('main'),
      registration: registration as never,
      snapshot: snapshot as never,
      storage: null,
      autosaveStorage: {} as never,
      workspace: workspace() as never,
      onSwitchProject: async () => {}
    })

    expect(mocks.core!.store.dispatch).not.toHaveBeenCalledWith({ type: 'markAllDirty' })
    session.dispose()
  })

  it('restores a differing autosaved snapshot as dirty working state on mount', async () => {
    const recovered = structuredClone(snapshot)
    recovered.scenes.main.name = 'Recovered'
    mocks.loadAutosaveResult = recovered
    const session = await mountProjectSession({
      root: document.createElement('main'),
      registration: registration as never,
      snapshot: snapshot as never,
      storage: null,
      autosaveStorage: {} as never,
      workspace: workspace() as never,
      onSwitchProject: async () => {}
    })

    expect(mocks.core!.store.dispatch).toHaveBeenCalledWith({ type: 'recoverSnapshot', snapshot: recovered })
    session.dispose()
  })

  it('ignores an autosave identical to the opened project', async () => {
    mocks.loadAutosaveResult = structuredClone(snapshot)
    const session = await mountProjectSession({
      root: document.createElement('main'),
      registration: registration as never,
      snapshot: snapshot as never,
      storage: null,
      autosaveStorage: {} as never,
      workspace: workspace() as never,
      onSwitchProject: async () => {}
    })

    expect(mocks.core!.store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'recoverSnapshot' }))
    session.dispose()
  })

  it('ignores destructive shortcuts that originate from an editable field', async () => {
    const root = document.createElement('main')
    document.body.append(root)
    const session = await mountProjectSession({
      root,
      registration: registration as never,
      snapshot: snapshot as never,
      storage: null,
      autosaveStorage: {} as never,
      workspace: workspace() as never,
      onSwitchProject: async () => {}
    })

    const input = document.createElement('input')
    root.append(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    expect(mocks.core!.deleteSelected).not.toHaveBeenCalled()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(mocks.core!.deleteSelected).toHaveBeenCalledOnce()

    session.dispose()
    root.remove()
  })

  it('stops advertising Save to the chrome after a bundle import drops the folder', async () => {
    const browserWorkspace = workspace(structuredClone(snapshot))
    const session = await mountProjectSession({
      root: document.createElement('main'),
      registration: registration as never,
      snapshot: snapshot as never,
      storage: storage() as never,
      autosaveStorage: {} as never,
      workspace: browserWorkspace as never,
      onSwitchProject: async () => {}
    })

    expect((mocks.chromeOptions!.canSave as () => boolean)()).toBe(true)

    mocks.chromeOptions!.onImport!()
    await vi.waitFor(() => expect(browserWorkspace.importBundle).toHaveBeenCalledOnce())

    expect((mocks.chromeOptions!.canSave as () => boolean)()).toBe(false)
    session.dispose()
  })

  it('ignores a second save while one is already in flight', async () => {
    const saveFn = vi.fn(async () => ({ saved: ['scenes/main.scene.json'], failed: [] }))
    const backing = storage(saveFn)
    const session = await mountProjectSession({
      root: document.createElement('main'),
      registration: registration as never,
      snapshot: snapshot as never,
      storage: backing as never,
      autosaveStorage: {} as never,
      workspace: workspace() as never,
      onSwitchProject: async () => {}
    })

    const [, second] = await Promise.all([session.save(), session.save()])

    expect(saveFn).toHaveBeenCalledOnce()
    expect(second).toBe(false)
    session.dispose()
  })

  it('reports save failures, no-storage saves, cancelled imports, and setup cleanup', async () => {
    const failedSave = storage(vi.fn(async () => ({
      saved: [], failed: [{ path: 'scene.json', message: 'denied' }]
    })))
    const browserWorkspace = workspace()
    browserWorkspace.importBundle.mockResolvedValueOnce(null)
    const failed = await mountProjectSession({
      root: document.createElement('main'),
      registration: registration as never,
      snapshot: snapshot as never,
      storage: failedSave as never,
      autosaveStorage: {} as never,
      workspace: browserWorkspace as never,
      onSwitchProject: async () => {}
    })
    await expect(failed.save()).resolves.toBe(false)
    expect(mocks.core!.store.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'saveFailed' }))
    mocks.chromeOptions!.onImport!()
    await vi.waitFor(() => expect(browserWorkspace.importBundle).toHaveBeenCalledOnce())
    failed.dispose()

    mocks.core = makeCore()
    const noStorage = await mountProjectSession({
      root: document.createElement('main'),
      registration: registration as never,
      snapshot: snapshot as never,
      storage: null,
      autosaveStorage: {} as never,
      workspace: workspace() as never,
      onSwitchProject: async () => {}
    })
    expect(noStorage.canSave).toBe(false)
    await expect(noStorage.save()).resolves.toBe(false)
    noStorage.dispose()

    mocks.core = makeCore()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(mountProjectSession({
      root: document.createElement('main'),
      registration: registration as never,
      snapshot: snapshot as never,
      storage: null,
      autosaveStorage: {} as never,
      workspace: workspace() as never,
      onSwitchProject: async () => {}
    })).rejects.toThrow('2D canvas context unavailable')
    expect(mocks.core.dispose).toHaveBeenCalled()
  })
})
