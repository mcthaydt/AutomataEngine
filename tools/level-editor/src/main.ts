import {
  GameLoop, createCleanupStack, createLoader, createRapierPhysics, createThreeRenderer,
  fetchTextViaFetch, localStorageAdapter
} from '@automata/engine'
import { attachCanvasRenderer, startLoopDriver } from '@automata/engine/browser'
import { createEditor, importDoc, installAutosave, loadAutosave } from '@automata/editor'
import { createAgentPanelMount } from '@automata/editor-agent'
import { renderEditorChrome } from '@automata/editor/ui'
import {
  attachFlyControls, paintMap, screenToWorldXZ, type ScreenSize
} from '@automata/editor/viewport'
import { createMonkeyBallDefinition, type Level } from 'monkey-ball'
import { loadLegacyMonkeyBallBootData } from './legacyMonkeyBallBoot'

function bootError(error: unknown): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'boot-error'
  panel.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`
  return panel
}

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) throw new Error('Missing #app')

  const cleanup = createCleanupStack()
  const dispose = (): void => {
    try {
      cleanup.dispose()
    } catch (error) {
      console.error('Cleanup failed', error)
    }
  }
  const onBeforeUnload = (): void => dispose()
  window.addEventListener('beforeunload', onBeforeUnload)
  cleanup.defer(() => window.removeEventListener('beforeunload', onBeforeUnload))

  try {
    const canvas3d = document.createElement('canvas')
    const canvas2d = document.createElement('canvas')

    const loader = createLoader(fetchTextViaFetch())
    const renderer = createThreeRenderer()
    cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await attachCanvasRenderer(renderer, canvas3d, { sizeTo: 'element' })
    cleanup.defer(() => canvasRenderer.dispose())
    const physics = await createRapierPhysics()
    cleanup.defer(() => physics.dispose())
    const boot = await loadLegacyMonkeyBallBootData(loader)
    const definition = createMonkeyBallDefinition(boot.lib, boot.tuning)

    const editor = createEditor<Level>({ definition, render: renderer.port, physics })
    cleanup.defer(() => editor.dispose())
    const storage = localStorageAdapter()
    const saved = loadAutosave(definition, storage, 'monkey-ball-editor')
    editor.store.dispatch({ type: 'loadDoc', doc: saved ?? definition.scene.emptyDoc() })
    const stopAutosave = installAutosave(editor.store, definition, storage, {
      key: 'monkey-ball-editor',
      debounceMs: 400
    })
    cleanup.defer(stopAutosave)

    const chrome = renderEditorChrome<Level>(
      editor,
      app,
      { '2d': canvas2d, '3d': canvas3d },
      { mountAgentPanel: createAgentPanelMount<Level>() }
    )
    cleanup.defer(() => chrome.dispose())
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'application/json'
    fileInput.hidden = true
    app.append(fileInput)
    cleanup.defer(() => fileInput.remove())
    editor.onExport = (result) => {
      if (!result.ok) return
      const blob = new Blob([result.json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'level.json'
      link.click()
      URL.revokeObjectURL(url)
    }
    editor.onImportRequest = () => fileInput.click()
    const onFileChange = async (): Promise<void> => {
      const file = fileInput.files?.[0]
      if (!file) return
      const result = importDoc(definition, await file.text())
      if (!cleanup.disposed && result.ok) editor.store.dispatch({ type: 'loadDoc', doc: result.doc })
      fileInput.value = ''
    }
    fileInput.addEventListener('change', onFileChange)
    cleanup.defer(() => fileInput.removeEventListener('change', onFileChange))
    const flyControls = attachFlyControls(canvas3d, () => editor.camera, (camera) => { editor.camera = camera })
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
      const onPointerDown = (event: PointerEvent): void => editAt(view, event, canvas)
      const onPointerMove = (event: PointerEvent): void => {
        const world = worldAt(view, localScreen(canvas, event), sizeOf(view, canvas))
        chrome.setCursorReadout(world ? { x: world.x, z: world.z } : null)
      }
      const onPointerLeave = (): void => chrome.setCursorReadout(null)
      canvas.addEventListener('pointerdown', onPointerDown)
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerleave', onPointerLeave)
      cleanup.defer(() => {
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerleave', onPointerLeave)
      })
    }

    const onKeyDown = (event: KeyboardEvent): void => {
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
    }
    window.addEventListener('keydown', onKeyDown)
    cleanup.defer(() => window.removeEventListener('keydown', onKeyDown))

    const loop = new GameLoop({
      fixedUpdate: (dt) => {
        flyControls.update(dt)
        editor.fixedUpdate(dt)
      },
      render: (alpha, frameDt) => {
        editor.tick(alpha, frameDt)
        canvasRenderer.renderFrame()
        const mapSize = fit(canvas2d)
        paintMap(context2d, editor.drawModel(mapSize), mapSize)
      }
    })
    const loopDriver = startLoopDriver(loop, () => editor.handleHidden())
    cleanup.defer(() => loopDriver.stop())
  } catch (error) {
    // Preserve the original boot failure even when rollback reports an error.
    dispose()
    app.replaceChildren(bootError(error))
  }
}

void main()
