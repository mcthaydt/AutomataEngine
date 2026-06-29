import type { PhysicsPort, RenderPort, Vec3 } from '@automata/engine'
import { CORE_TYPE_IDS, resolveWorldTransform, worldToLocalPosition, type ProjectSnapshot, type SceneDocument } from '@automata/project'
import { snapVec3XZ } from '../grid'
import { buildProjectDrawModel, type DrawOp } from '../viewport2d/projectDraw'
import { hitTestProjectMap } from '../viewport2d/projectHit'
import { initialMapView, type MapView, type ScreenSize } from '../viewport2d/projection'
import { pickBounded } from '../viewport3d/aabb'
import { cameraView, initialFlyCamera, type FlyCamera } from '../viewport3d/flyCamera'
import { buildRay, EDITOR_FOV_Y } from '../viewport3d/ray'
import type { EditorProjectRegistration, ProjectPlayHandle, RegisteredEditorProject } from './registration'
import { createProjectEditorStore, type ProjectEditorStore } from './store'
import { buildProjectSpatialItems, type SpatialItem } from './spatial'
import { createProjectWorldSync, type ProjectWorldSync } from './worldSync'
import type { ProjectSelection } from './selection'

/**
 * The generic project editor core: it owns the session store, the edit-mode
 * world sync, the fly camera, and play-mode entry/exit. Every operation is
 * expressed as project commands; the host never branches on a game.
 */
export interface ProjectEditorOpts<Compiled> {
  registration: EditorProjectRegistration<Compiled> | RegisteredEditorProject
  snapshot: ProjectSnapshot
  render: RenderPort
  physics: PhysicsPort
}

export interface ProjectEditorCore {
  registration: RegisteredEditorProject
  store: ProjectEditorStore
  camera: FlyCamera
  mapView: MapView
  tick(alpha: number, frameDt?: number): void
  fixedUpdate(dt: number): void
  enterPlay(): void
  exitPlay(): void
  placePrefabAt(prefabId: string, world: Vec3): void
  moveSelectionTo(world: Vec3): void
  deleteSelected(): void
  pick2d(screen: { x: number; y: number }, size: ScreenSize): void
  pick3d(screen: { x: number; y: number }, size: ScreenSize): void
  drawModel(size: ScreenSize): DrawOp[]
  dispose(): void
}

const IDENTITY_WORLD = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } }

export function createProjectEditor<Compiled>(opts: ProjectEditorOpts<Compiled>): ProjectEditorCore {
  const { render, physics } = opts
  const store = createProjectEditorStore(opts.registration, opts.snapshot)
  const registration = store.getState().registration

  let sync: ProjectWorldSync = createProjectWorldSync(render)
  let camera = initialFlyCamera
  let play: ProjectPlayHandle | null = null
  const mapView = initialMapView
  let lastSnapshot: ProjectSnapshot | undefined
  let lastSceneId: string | undefined
  let lastSelection: ProjectSelection | undefined
  let placeCounter = 0

  const activeScene = (): SceneDocument | undefined => {
    const state = store.getState()
    return state.snapshot.scenes[state.activeSceneId]
  }
  const spatialItems = (): SpatialItem[] => {
    const scene = activeScene()
    return scene ? buildProjectSpatialItems(scene, registration.componentTypes) : []
  }
  const selectedEntityIds = (): Set<string> => {
    const selection = store.getState().selection
    if (selection.kind === 'entity') return new Set(selection.entityIds)
    if (selection.kind === 'component') return new Set([selection.entityId])
    return new Set()
  }
  const dispatchPick = (id: string | null): void => {
    const sceneId = store.getState().activeSceneId
    store.dispatch(id
      ? { type: 'select', selection: { kind: 'entity', sceneId, entityIds: [id] } }
      : { type: 'select', selection: { kind: 'scene', sceneId } })
  }
  const uniqueEntityId = (scene: SceneDocument, base: string): string => {
    let id = `${base}-${++placeCounter}`
    while (scene.entities.some((entity) => entity.id === id)) id = `${base}-${++placeCounter}`
    return id
  }

  const leavePlay = (): void => {
    if (!play) return
    play.dispose()
    play = null
    sync = createProjectWorldSync(render)
    lastSnapshot = undefined
    lastSceneId = undefined
    lastSelection = undefined
    store.dispatch({ type: 'setMode', mode: 'edit' })
  }

  return {
    registration,
    store,
    get camera() { return camera },
    set camera(next: FlyCamera) { camera = next },
    mapView,
    tick(alpha, frameDt = 0) {
      if (play) {
        play.render(alpha, frameDt)
        return
      }
      const state = store.getState()
      if (state.snapshot !== lastSnapshot || state.activeSceneId !== lastSceneId) {
        sync.syncNow(spatialItems(), selectedEntityIds())
        lastSnapshot = state.snapshot
        lastSceneId = state.activeSceneId
        lastSelection = state.selection
      } else if (state.selection !== lastSelection) {
        sync.applyHighlight(selectedEntityIds())
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
      if (!registration.createPreview) throw new Error('this registration has no preview support')
      const snapshot = store.getState().snapshot
      const errors = registration.validate(snapshot).filter((issue) => issue.severity === 'error')
      if (errors.length > 0) throw new Error(`invalid project: ${errors.map((issue) => issue.code).join('; ')}`)
      const compiled = registration.compile(snapshot)
      // Create the preview before tearing down edit sync, so a failure leaves edit live.
      const nextPlay = registration.createPreview(compiled, store.getState().activeSceneId, render, physics)
      sync.dispose()
      play = nextPlay
      store.dispatch({ type: 'setMode', mode: 'play' })
    },
    exitPlay() {
      leavePlay()
    },
    placePrefabAt(prefabId, world) {
      const prefab = registration.prefabs.find((candidate) => candidate.id === prefabId)
      if (!prefab) return
      const state = store.getState()
      const sceneId = state.activeSceneId
      const scene = state.snapshot.scenes[sceneId]
      if (!scene) return
      const entityId = uniqueEntityId(scene, prefabId)
      const snapped = snapVec3XZ(world, state.snap)
      const components = prefab.components.map((component, index) => ({
        id: `${entityId}-c${index}`,
        typeId: component.typeId,
        data: component.typeId === CORE_TYPE_IDS.transform
          ? { ...component.data, position: { x: snapped.x, y: world.y, z: snapped.z } }
          : { ...component.data }
      }))
      store.dispatch({ type: 'projectCommand', command: { type: 'addEntity', sceneId, entity: { id: entityId, name: prefab.label, enabled: true, components } } })
      store.dispatch({ type: 'select', selection: { kind: 'entity', sceneId, entityIds: [entityId] } })
    },
    moveSelectionTo(world) {
      const state = store.getState()
      const selection = state.selection
      if (selection.kind !== 'entity' || selection.entityIds.length === 0) return
      const sceneId = selection.sceneId
      const scene = state.snapshot.scenes[sceneId]
      if (!scene) return
      const entityId = selection.entityIds[0]!
      const entity = scene.entities.find((candidate) => candidate.id === entityId)
      const transform = entity?.components.find((component) => component.typeId === CORE_TYPE_IDS.transform)
      if (!entity || !transform) return
      const snapped = snapVec3XZ(world, state.snap)
      const parentWorld = entity.parentId ? resolveWorldTransform(scene, entity.parentId) : IDENTITY_WORLD
      const local = worldToLocalPosition(parentWorld, { x: snapped.x, y: world.y, z: snapped.z })
      store.dispatch({ type: 'projectCommand', command: { type: 'setProperty', target: { kind: 'component', sceneId, entityId, componentId: transform.id }, pointer: '/position', value: local } })
    },
    deleteSelected() {
      const selection = store.getState().selection
      if (selection.kind === 'entity' && selection.entityIds.length > 0) {
        store.dispatch({ type: 'projectCommand', command: { type: 'removeEntities', sceneId: selection.sceneId, entityIds: selection.entityIds } })
      } else if (selection.kind === 'component') {
        store.dispatch({ type: 'projectCommand', command: { type: 'removeComponent', sceneId: selection.sceneId, entityId: selection.entityId, componentId: selection.componentId } })
      }
    },
    pick2d(screen, size) {
      dispatchPick(hitTestProjectMap(spatialItems(), mapView, size, screen))
    },
    pick3d(screen, size) {
      const ray = buildRay(camera, screen, size, EDITOR_FOV_Y)
      const id = pickBounded(spatialItems().map((item) => ({ id: item.entityId, position: item.position, bounds: item.bounds })), ray)
      dispatchPick(id)
    },
    drawModel(size) {
      return buildProjectDrawModel(spatialItems(), selectedEntityIds(), mapView, size)
    },
    dispose() {
      play?.dispose()
      play = null
      sync.dispose()
    }
  }
}
