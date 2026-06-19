import {
  GameLoop, attachCanvasRenderer, createLoader, createRapierPhysics, createThreeRenderer,
  fetchTextViaFetch, startLoopDriver
} from '@automata/engine'
import {
  attachFlyControls, createEditor, paintMap, renderPanels, screenToWorldXZ
} from '@automata/editor'
import { createMonkeyBallDefinition, loadBootData, type Level } from 'monkey-ball'

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')

  const canvas3d = document.createElement('canvas')
  const canvas2d = document.createElement('canvas')
  canvas2d.width = 360
  canvas2d.height = 360
  canvas2d.className = 'map'
  app.append(canvas3d, canvas2d)

  const loader = createLoader(fetchTextViaFetch())
  const renderer = createThreeRenderer()
  const canvasRenderer = attachCanvasRenderer(renderer, canvas3d)
  const physics = await createRapierPhysics()
  const boot = await loadBootData(loader)
  const definition = createMonkeyBallDefinition(boot.lib, boot.tuning)

  const editor = createEditor<Level>({ definition, render: renderer.port, physics })
  editor.store.dispatch({ type: 'loadDoc', doc: definition.scene.emptyDoc() })
  attachFlyControls(canvas3d, () => editor.camera, (camera) => { editor.camera = camera })
  const panelHost = document.createElement('div')
  panelHost.id = 'panels'
  app.append(panelHost)
  renderPanels(editor, panelHost)

  const context2d = canvas2d.getContext('2d')
  if (!context2d) throw new Error('2D canvas context unavailable')
  canvas2d.addEventListener('pointerdown', (event) => {
    const screen = { x: event.offsetX, y: event.offsetY }
    const size = { w: canvas2d.width, h: canvas2d.height }
    const xz = screenToWorldXZ(editor.mapView, screen, size)
    if (event.shiftKey) {
      editor.moveSelectionTo({ x: xz.x, y: 0, z: xz.z })
      return
    }
    if (editor.store.getState().tool.selection.mode === 'place') {
      editor.placeAt({ x: xz.x, y: 0, z: xz.z })
      return
    }
    editor.pick2d(screen, size)
  })
  canvas3d.addEventListener('pointerdown', (event) => {
    const rect = canvas3d.getBoundingClientRect()
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const size = { w: rect.width, h: rect.height }
    const world = editor.groundPointAt(screen, size)
    if (event.shiftKey) {
      if (world) editor.moveSelectionTo(world)
      return
    }
    if (editor.store.getState().tool.selection.mode === 'place') {
      if (world) editor.placeAt(world)
      return
    }
    editor.pick3d(screen, size)
  })
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Delete' || event.key === 'Backspace') editor.deleteSelected()
    if (event.key.toLowerCase() === 'c') {
      const [id] = editor.store.getState().selection
      if (id) editor.cycleSurfaceOn(id)
    }
  })

  const loop = new GameLoop({
    fixedUpdate: () => {},
    render: (alpha) => {
      editor.tick(alpha)
      canvasRenderer.renderFrame()
      paintMap(
        context2d,
        editor.drawModel({ w: canvas2d.width, h: canvas2d.height }),
        { w: canvas2d.width, h: canvas2d.height }
      )
    }
  })
  startLoopDriver(loop)
}

void main()
