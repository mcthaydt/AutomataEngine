import type { PhysicsPort, RenderPort } from '@automata/engine'
import type { GameDefinition } from './model/gameDefinition'
import { createEditorStore, type EditorStore } from './state/store'
import { buildDrawModel, type DrawOp } from './viewport2d/draw'
import { initialMapView, type MapView, type ScreenSize } from './viewport2d/projection'
import { cameraView, initialFlyCamera, type FlyCamera } from './viewport3d/flyCamera'
import { createWorldSync } from './viewport3d/worldSync'

export interface EditorCoreOpts<Doc> {
  definition: GameDefinition<Doc>
  render: RenderPort
  physics: PhysicsPort
}

export interface EditorCore<Doc> {
  store: EditorStore<Doc>
  camera: FlyCamera
  mapView: MapView
  /** Re-sync the 3D world from the doc and render a frame. */
  tick(alpha: number): void
  drawModel(size: ScreenSize): DrawOp[]
  dispose(): void
}

export function createEditor<Doc>(opts: EditorCoreOpts<Doc>): EditorCore<Doc> {
  const { definition, render, physics } = opts
  const store = createEditorStore<Doc>(definition)
  const sync = createWorldSync(definition, store, render, physics)
  let camera = initialFlyCamera
  const mapView = initialMapView
  let dirtyDoc = -1

  return {
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
    dispose() {
      sync.dispose()
    }
  }
}
