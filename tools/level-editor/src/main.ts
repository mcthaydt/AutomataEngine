import {
  GameLoop, attachCanvasRenderer, createLoader, createRapierPhysics, createThreeRenderer,
  fetchTextViaFetch, startLoopDriver
} from '@automata/engine'
import { attachFlyControls, createEditor, paintMap } from '@automata/editor'
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

  const context2d = canvas2d.getContext('2d')
  if (!context2d) throw new Error('2D canvas context unavailable')

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
