import type { PhysicsPort, RenderPort, Vec3 } from '@automata/engine'
import { snapVec3XZ } from './grid'
import { validateDoc } from './io/validation'
import type { ExportResult } from './io/exportDoc'
import type { GameDefinition, PlayHandle } from './model/gameDefinition'
import { createEditorStore, type EditorStore } from './state/store'
import { canDelete } from './tools/cardinality'
import { nextSurface } from './tools/surfaceCycle'
import { placementCommand } from './tools/place'
import { buildDrawModel, type DrawOp } from './viewport2d/draw'
import { hitTestMap } from './viewport2d/hit'
import { initialMapView, type MapView, type ScreenSize } from './viewport2d/projection'
import { pickItem } from './viewport3d/aabb'
import { cameraView, initialFlyCamera, type FlyCamera } from './viewport3d/flyCamera'
import { buildRay, EDITOR_FOV_Y, rayPlaneY } from './viewport3d/ray'
import { createWorldSync } from './viewport3d/worldSync'

export interface EditorCoreOpts<Doc> {
  definition: GameDefinition<Doc>
  render: RenderPort
  physics: PhysicsPort
}

export interface EditorCore<Doc> {
  definition: GameDefinition<Doc>
  store: EditorStore<Doc>
  camera: FlyCamera
  mapView: MapView
  /** Re-sync the 3D world from the doc and render a frame. */
  tick(alpha: number): void
  fixedUpdate(dt: number): void
  enterPlay(): void
  exitPlay(): void
  handleHidden(): void
  onExport?: (result: ExportResult) => void
  onImportRequest?: () => void
  drawModel(size: ScreenSize): DrawOp[]
  pick3d(screen: { x: number; y: number }, size: ScreenSize): void
  pick2d(screen: { x: number; y: number }, size: ScreenSize): void
  placeAt(world: Vec3): void
  moveSelectionTo(world: Vec3): void
  groundPointAt(screen: { x: number; y: number }, size: ScreenSize): Vec3 | null
  cycleSurfaceOn(id: string): void
  deleteSelected(): void
  dispose(): void
}

export function createEditor<Doc>(opts: EditorCoreOpts<Doc>): EditorCore<Doc> {
  const { definition, render, physics } = opts
  const store = createEditorStore<Doc>(definition)
  let sync = createWorldSync(definition, store, render, physics)
  let camera = initialFlyCamera
  let play: PlayHandle | null = null
  const mapView = initialMapView
  let lastDoc: Doc | undefined
  let lastSelection: string[] | undefined

  const exitPlay = (): void => {
    if (!play) return

    play.dispose()
    play = null
    sync = createWorldSync(definition, store, render, physics)
    lastDoc = undefined
    lastSelection = undefined
    store.dispatch({ type: 'setMode', mode: 'edit' })
  }

  return {
    definition,
    store,
    get camera() { return camera },
    set camera(next: FlyCamera) { camera = next },
    mapView,
    tick(alpha) {
      if (play) {
        play.render(alpha)
        return
      }

      const state = store.getState()
      // Reducers return new doc/selection references only on real change, so
      // identity comparison is exact: rebuild the world when the doc changes,
      // otherwise re-apply the (cheap) highlight when only the selection changes.
      if (state.document.doc !== lastDoc) {
        sync.syncNow()
        lastDoc = state.document.doc
        lastSelection = state.selection
      } else if (state.selection !== lastSelection) {
        sync.applyHighlight()
        lastSelection = state.selection
      }
      const view = cameraView(camera)
      render.setCamera(view.position, view.lookAt)
      sync.render(alpha)
    },
    fixedUpdate(dt) {
      play?.fixedUpdate(dt)
    },
    enterPlay() {
      if (play) return
      if (!definition.play) throw new Error('this definition has no play support')

      const validation = validateDoc(definition, store.getState().document.doc)
      if (!validation.exportable) throw new Error(`invalid document: ${validation.issues.join('; ')}`)

      const nextPlay = definition.play.createGameplay(store.getState().document.doc, render, physics)
      sync.dispose()
      play = nextPlay
      store.dispatch({ type: 'setMode', mode: 'play' })
    },
    exitPlay() {
      exitPlay()
    },
    handleHidden() {
      exitPlay()
    },
    drawModel(size) {
      const state = store.getState()
      return buildDrawModel(definition, definition.scene.listItems(state.document.doc), state.selection, mapView, size)
    },
    pick3d(screen, size) {
      const items = definition.scene.listItems(store.getState().document.doc)
      const ray = buildRay(camera, screen, size, EDITOR_FOV_Y)
      const id = pickItem(items, ray)
      store.dispatch({ type: 'select', ids: id ? [id] : [] })
    },
    pick2d(screen, size) {
      const items = definition.scene.listItems(store.getState().document.doc)
      const id = hitTestMap(definition, items, mapView, size, screen)
      store.dispatch({ type: 'select', ids: id ? [id] : [] })
    },
    groundPointAt(screen, size) {
      return rayPlaneY(buildRay(camera, screen, size, EDITOR_FOV_Y), 0)
    },
    placeAt(world) {
      const state = store.getState()
      const brushId = state.tool.selection.brushId
      if (!brushId) return
      const brushes = [...definition.palette.geometry, ...definition.palette.archetypes, ...definition.palette.markers]
      const brush = brushes.find((candidate) => candidate.id === brushId)
      if (!brush) return
      const items = definition.scene.listItems(state.document.doc)
      const command = placementCommand(definition, items, brush, world, state.ui.snap)
      if (command) store.dispatch({ type: 'command', command })
    },
    moveSelectionTo(world) {
      const state = store.getState()
      const [anchorId] = state.selection
      if (!anchorId) return
      const items = definition.scene.listItems(state.document.doc)
      const anchor = items.find((item) => item.id === anchorId)
      if (!anchor) return
      const target = snapVec3XZ(world, state.ui.snap)
      const position = anchor.transform.position
      store.dispatch({
        type: 'command',
        command: {
          type: 'moveSelected',
          ids: state.selection,
          delta: { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z }
        }
      })
    },
    cycleSurfaceOn(id) {
      const current = definition.scene.getSurface(store.getState().document.doc, id)
      const surface = nextSurface(definition.surfacePalette, current)
      store.dispatch({ type: 'command', command: { type: 'setSurface', id, surface } })
    },
    deleteSelected() {
      const state = store.getState()
      const items = definition.scene.listItems(state.document.doc)
      const ids = state.selection.filter((id) => canDelete(definition, items, id))
      if (ids.length) store.dispatch({ type: 'command', command: { type: 'deleteItems', ids } })
    },
    dispose() {
      play?.dispose()
      play = null
      sync.dispose()
    }
  }
}
