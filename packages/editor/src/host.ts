import type { PhysicsPort, RenderPort, Vec3 } from '@automata/engine'
import type { GameDefinition } from './model/gameDefinition'
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

const GRID_CELL = 0.5

export function createEditor<Doc>(opts: EditorCoreOpts<Doc>): EditorCore<Doc> {
  const { definition, render, physics } = opts
  const store = createEditorStore<Doc>(definition)
  const sync = createWorldSync(definition, store, render, physics)
  let camera = initialFlyCamera
  const mapView = initialMapView
  let dirtyDoc = -1

  return {
    definition,
    store,
    get camera() { return camera },
    set camera(next: FlyCamera) { camera = next },
    mapView,
    tick(alpha) {
      const state = store.getState()
      const stamp = state.document.past.length + state.selection.length * 1e6
      if (stamp !== dirtyDoc) {
        sync.syncNow()
        dirtyDoc = stamp
      }
      const view = cameraView(camera)
      render.setCamera(view.position, view.lookAt)
      sync.render(alpha)
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
      const command = placementCommand(definition, items, brush, world, GRID_CELL)
      if (command) store.dispatch({ type: 'command', command })
    },
    moveSelectionTo(world) {
      const state = store.getState()
      const [anchorId] = state.selection
      if (!anchorId) return
      const items = definition.scene.listItems(state.document.doc)
      const anchor = items.find((item) => item.id === anchorId)
      if (!anchor) return
      const position = anchor.transform.position
      store.dispatch({
        type: 'command',
        command: {
          type: 'moveSelected',
          ids: state.selection,
          delta: { x: world.x - position.x, y: world.y - position.y, z: world.z - position.z }
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
      sync.dispose()
    }
  }
}
