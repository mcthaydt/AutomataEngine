import { attachCanvasRenderer, createThreeRenderer, startLoopDriver } from '@automata/engine'
import { createDemoScene } from './demoScene'

const canvas = document.createElement('canvas')
document.getElementById('app')!.appendChild(canvas)

const renderer = createThreeRenderer()
const canvasRenderer = attachCanvasRenderer(renderer, canvas)
const demo = createDemoScene(renderer.port, () => canvasRenderer.renderFrame())
startLoopDriver(demo.loop)
