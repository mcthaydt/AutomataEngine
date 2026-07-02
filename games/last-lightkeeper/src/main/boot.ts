import {
  GameLoop,
  createCleanupStack,
  createSceneManager,
  createThreeSpriteRenderer,
  localStorageAdapter,
  memoryStorage,
  subscribeSelector,
  type Scene,
  type SpriteTextureSource,
  type StoragePort,
  type ThreeSpriteRenderer
} from '@automata/engine'
import {
  attachCanvasRenderer,
  startLoopDriver,
  type CanvasRenderer,
  type LoopDriver
} from '@automata/engine/browser'
import {
  createBrowserAudio,
  createOverlayScene,
  type BrowserAudio,
  type View
} from '@automata/game-kit'

import { createAssetCatalog, AssetLoadError } from '../assets/load'
import { parseAssetManifest, type AssetManifest } from '../assets/schema'
import { registerSounds } from '../audio/sounds'
import { createGameplay } from '../game/gameplay'
import { createActionInput, type ActionInputSource } from '../input/actions'
import type { SceneId } from '../state/actions'
import { createGameStore, type GameStore } from '../state/root'
import { createHud } from '../ui/hud'
import { createInstructions } from '../ui/instructions'
import { createDefeat, createPauseOverlay, createVictory } from '../ui/overlays'
import { createTitle } from '../ui/title'

export interface LoadedAssetSources {
  manifest: AssetManifest
  sources: ReadonlyMap<string, SpriteTextureSource>
}

export type AssetImageLoader = (url: string) => Promise<SpriteTextureSource>

export async function loadAssetSources(
  input: unknown,
  resolveUrl: (file: string) => string | undefined,
  loadImage: AssetImageLoader
): Promise<LoadedAssetSources> {
  if (input === undefined || input === null) throw new AssetLoadError('Missing asset manifest')
  const parsed = parseAssetManifest(input)
  const decoded = new Map<string, SpriteTextureSource>()

  for (const asset of parsed.assets) {
    const url = resolveUrl(asset.file)
    if (url === undefined) throw new AssetLoadError(`Missing asset file: ${asset.file}`)
    try {
      decoded.set(asset.file, await loadImage(url))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new AssetLoadError(`Failed to load ${asset.file}: ${reason}`)
    }
  }

  const catalog = createAssetCatalog(parsed, decoded)
  return {
    manifest: catalog.manifest,
    sources: new Map(catalog.manifest.assets.map((asset) => [asset.id, decoded.get(asset.file)!]))
  }
}

export interface BootAdapters {
  loadAssets(): Promise<LoadedAssetSources>
  createSpriteRenderer(sources: ReadonlyMap<string, SpriteTextureSource>): ThreeSpriteRenderer
  attachRenderer(renderer: ThreeSpriteRenderer, canvas: HTMLCanvasElement): Promise<CanvasRenderer>
  createAudio(): BrowserAudio
  createInput(target: EventTarget): ActionInputSource
  createStorage(): StoragePort
  startDriver(loop: GameLoop, onHidden: () => void): LoopDriver
  createSeed(): number
}

export interface BrowserGame {
  store: GameStore
  dispose(): void
}

export interface KeeperTestSnapshot {
  scene: SceneId
  timeS: number
  x: number
  floor: string
  activeCallId: string | null
  callStatus: string | null
  rescues: number
  beaconBearingDeg: number
  circuits: ReturnType<GameStore['getState']>['night']['circuits']
}

declare global {
  interface Window {
    __LAST_LIGHTKEEPER_TEST__?: {
      snapshot(): KeeperTestSnapshot
      advanceTimeTo(timeS: number): void
      step(seconds: number): void
    }
  }
}

function browserImage(url: string): Promise<SpriteTextureSource> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({
      image,
      width: image.naturalWidth,
      height: image.naturalHeight
    })
    image.onerror = () => reject(new Error(`Image decode failed: ${url}`))
    image.src = url
  })
}

export function createDefaultBootAdapters(
  manifest: unknown,
  resolveUrl: (file: string) => string | undefined
): BootAdapters {
  return {
    loadAssets: () => loadAssetSources(manifest, resolveUrl, browserImage),
    createSpriteRenderer: (sources) => createThreeSpriteRenderer(sources),
    attachRenderer: (renderer, canvas) => attachCanvasRenderer(renderer, canvas, { sizeTo: 'element' }),
    createAudio: () => createBrowserAudio(),
    createInput: (target) => createActionInput(target),
    createStorage: () => localStorageAdapter(),
    startDriver: (loop, onHidden) => startLoopDriver(loop, onHidden),
    createSeed: () => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
  }
}

export async function bootBrowserGame(
  app: HTMLElement,
  adapters: BootAdapters
): Promise<BrowserGame> {
  const cleanup = createCleanupStack()
  try {
    const assets = await adapters.loadAssets()
    const canvas = document.createElement('canvas')
    canvas.className = 'game-canvas'
    canvas.width = 480
    canvas.height = 270
    canvas.setAttribute('aria-label', 'Lighthouse watch')
    app.append(canvas)
    cleanup.defer(() => canvas.remove())

    const overlays = document.createElement('div')
    overlays.id = 'overlays'
    app.append(overlays)
    cleanup.defer(() => overlays.remove())

    const renderer = adapters.createSpriteRenderer(assets.sources)
    cleanup.defer(() => renderer.port.dispose())
    const canvasRenderer = await adapters.attachRenderer(renderer, canvas)
    cleanup.defer(() => canvasRenderer.dispose())

    let storage: StoragePort
    try {
      storage = adapters.createStorage()
    } catch {
      storage = memoryStorage()
    }
    const store = createGameStore({ storage })

    const audioRuntime = adapters.createAudio()
    cleanup.defer(() => audioRuntime.dispose())
    registerSounds(audioRuntime.audio)
    audioRuntime.audio.setMasterVolume(0.7)
    const onFirstPointer = (): void => audioRuntime.resume()
    window.addEventListener('pointerdown', onFirstPointer, { once: true })
    cleanup.defer(() => window.removeEventListener('pointerdown', onFirstPointer))
    const onOverlayClick = (event: MouseEvent): void => {
      if ((event.target as HTMLElement).closest('button')) audioRuntime.audio.play('ui')
    }
    overlays.addEventListener('click', onOverlayClick)
    cleanup.defer(() => overlays.removeEventListener('click', onOverlayClick))

    const input = adapters.createInput(window)
    cleanup.defer(() => input.dispose())
    const game = createGameplay({
      store,
      manifest: assets.manifest,
      render: renderer.port,
      input,
      audio: audioRuntime.audio,
      presentation: {
        trigger(kind) {
          app.dataset.feedback = kind
        }
      }
    })
    cleanup.defer(() => game.dispose())

    const hud = createHud(store)
    app.append(hud.element)
    cleanup.defer(() => hud.dispose())
    const inRun = (scene: SceneId): boolean => scene === 'playing' || scene === 'paused'
    const reflectChrome = (scene: SceneId): void => {
      hud.element.style.display = inRun(scene) ? 'grid' : 'none'
      canvas.style.visibility = inRun(scene) ? 'visible' : 'hidden'
    }
    reflectChrome(store.getState().scene)
    cleanup.defer(subscribeSelector(store, (state) => state.scene, reflectChrome))

    const seed = (): number => adapters.createSeed()
    const overlayScene = (make: () => View): Scene<SceneId> => createOverlayScene(overlays, make)
    const scenes: Record<SceneId, Scene<SceneId>> = {
      title: overlayScene(() => createTitle(store, seed)),
      instructions: overlayScene(() => createInstructions(store)),
      playing: {},
      paused: overlayScene(() => createPauseOverlay(store, seed)),
      victory: overlayScene(() => createVictory(store, seed)),
      defeat: overlayScene(() => createDefeat(store, seed))
    }
    const sceneManager = createSceneManager(store, (state) => state.scene, scenes)
    cleanup.defer(sceneManager.start())

    const loop = new GameLoop({
      fixedUpdate: (dt) => game.fixedUpdate(dt),
      render: (alpha) => {
        game.render(alpha)
        canvasRenderer.renderFrame()
      }
    })
    const driver = adapters.startDriver(loop, () => {
      if (store.getState().scene === 'playing') store.dispatch({ type: 'paused' })
    })
    cleanup.defer(() => driver.stop())

    const testMode = import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get('e2e') === '1'
    if (testMode) {
      window.__LAST_LIGHTKEEPER_TEST__ = {
        snapshot() {
          const state = store.getState()
          const activeCall = state.night.activeCallId === null
            ? null
            : state.night.calls[state.night.activeCallId]
          return {
            scene: state.scene,
            timeS: state.night.timeS,
            x: state.night.keeper.x,
            floor: state.night.keeper.floor,
            activeCallId: state.night.activeCallId,
            callStatus: activeCall?.status ?? null,
            rescues: state.night.rescues,
            beaconBearingDeg: state.night.beaconBearingDeg,
            circuits: state.night.circuits
          }
        },
        advanceTimeTo(timeS) {
          const state = store.getState()
          if (state.scene !== 'playing' || !Number.isFinite(timeS)) return
          const clamped = Math.max(state.night.timeS, Math.min(779, timeS))
          store.dispatch({ type: 'nightAdvanced', night: { ...state.night, timeS: clamped } })
        },
        step(seconds) {
          if (!Number.isFinite(seconds) || seconds <= 0) return
          const target = Math.min(779, store.getState().night.timeS + seconds)
          while (store.getState().scene === 'playing' && store.getState().night.timeS < target) {
            const remaining = target - store.getState().night.timeS
            game.fixedUpdate(Math.min(1 / 30, remaining))
          }
        }
      }
      cleanup.defer(() => { delete window.__LAST_LIGHTKEEPER_TEST__ })
    }

    const onBeforeUnload = (): void => cleanup.dispose()
    window.addEventListener('beforeunload', onBeforeUnload)
    cleanup.defer(() => window.removeEventListener('beforeunload', onBeforeUnload))

    return { store, dispose: () => cleanup.dispose() }
  } catch (error) {
    cleanup.dispose()
    throw error
  }
}
