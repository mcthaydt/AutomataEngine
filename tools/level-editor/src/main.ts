import {
  GameLoop, attachCanvasRenderer, createLoader, createRapierPhysics, createThreeRenderer,
  fetchTextViaFetch, startLoopDriver
} from '@automata/engine'
import {
  attachFlyControls, createEditor, paintMap, renderEditorChrome, screenToWorldXZ, type ScreenSize
} from '@automata/editor'
import { createMonkeyBallDefinition, loadBootData, type Level } from 'monkey-ball'

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')

  const canvas3d = document.createElement('canvas')
  const canvas2d = document.createElement('canvas')

  const loader = createLoader(fetchTextViaFetch())
  const renderer = createThreeRenderer()
  const canvasRenderer = attachCanvasRenderer(renderer, canvas3d, { sizeTo: 'element' })
  const physics = await createRapierPhysics()
  const boot = await loadBootData(loader)
  const definition = createMonkeyBallDefinition(boot.lib, boot.tuning)

  const editor = createEditor<Level>({ definition, render: renderer.port, physics })
  editor.store.dispatch({ type: 'loadDoc', doc: definition.scene.emptyDoc() })

  const chrome = renderEditorChrome<Level>(editor, app, { '2d': canvas2d, '3d': canvas3d })
  attachFlyControls(canvas3d, () => editor.camera, (camera) => { editor.camera = camera })

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

  // The WebGL renderer owns canvas3d's backing buffer (DPR-scaled). Only measure it —
  // mutating canvas.width here desyncs the buffer from gl.viewport and skews the render.
  const measure = (canvas: HTMLCanvasElement): ScreenSize => {
    const rect = canvas.getBoundingClientRect()
    return { w: Math.max(1, Math.floor(rect.width)), h: Math.max(1, Math.floor(rect.height)) }
  }

  const sizeOf = (view: '2d' | '3d', canvas: HTMLCanvasElement): ScreenSize =>
    view === '2d' ? fit(canvas) : measure(canvas)

  const localScreen = (canvas: HTMLCanvasElement, event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const worldAt = (view: '2d' | '3d', screen: { x: number; y: number }, size: ScreenSize) =>
    view === '2d'
      ? (() => {
          const xz = screenToWorldXZ(editor.mapView, screen, size)
          return { x: xz.x, y: 0, z: xz.z }
        })()
      : editor.groundPointAt(screen, size)

  const editAt = (view: '2d' | '3d', event: PointerEvent, canvas: HTMLCanvasElement): void => {
    if (editor.store.getState().ui.primaryView !== view) {
      editor.store.dispatch({ type: 'setPrimaryView', view })
      return
    }
    const size = sizeOf(view, canvas)
    const screen = localScreen(canvas, event)
    const world = worldAt(view, screen, size)
    if (event.shiftKey) {
      if (world) editor.moveSelectionTo(world)
      return
    }
    if (editor.store.getState().tool.selection.mode === 'place') {
      if (world) editor.placeAt(world)
      return
    }
    if (view === '2d') editor.pick2d(screen, size)
    else editor.pick3d(screen, size)
  }

  for (const [view, canvas] of [['2d', canvas2d], ['3d', canvas3d]] as const) {
    canvas.addEventListener('pointerdown', (event) => editAt(view, event, canvas))
    canvas.addEventListener('pointermove', (event) => {
      const world = worldAt(view, localScreen(canvas, event), sizeOf(view, canvas))
      chrome.setCursorReadout(world ? { x: world.x, z: world.z } : null)
    })
    canvas.addEventListener('pointerleave', () => chrome.setCursorReadout(null))
  }

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase()
    if (event.key === 'Delete' || event.key === 'Backspace') editor.deleteSelected()
    else if (key === 'q' || event.key === 'Escape') {
      editor.store.dispatch({ type: 'setTool', tool: { brushId: null, mode: 'select' } })
    } else if (event.key === 'Tab') {
      event.preventDefault()
      const view = editor.store.getState().ui.primaryView
      editor.store.dispatch({ type: 'setPrimaryView', view: view === '2d' ? '3d' : '2d' })
    } else if (event.key === '\\') {
      editor.store.dispatch({ type: 'toggleInset' })
    } else if ((event.metaKey || event.ctrlKey) && key === 'z') {
      event.preventDefault()
      editor.store.dispatch(event.shiftKey ? { type: 'redo' } : { type: 'undo' })
    } else if (key === 'c') {
      const [id] = editor.store.getState().selection
      if (id) editor.cycleSurfaceOn(id)
    }
  })

  const loop = new GameLoop({
    fixedUpdate: () => {},
    render: (alpha) => {
      editor.tick(alpha)
      canvasRenderer.renderFrame()
      const mapSize = fit(canvas2d)
      paintMap(context2d, editor.drawModel(mapSize), mapSize)
    }
  })
  window.addEventListener('beforeunload', () => chrome.dispose())
  startLoopDriver(loop)
}

void main()
