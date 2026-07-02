import {
  createNullAudio,
  createRecordingSpriteRenderer,
  memoryStorage,
  type SpriteTextureSource
} from '@automata/engine'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import manifest from '../../assets/manifest.json'
import { parseAssetManifest } from '../../src/assets/schema'
import {
  bootBrowserGame,
  loadAssetSources,
  type BootAdapters,
  type BrowserGame
} from '../../src/main/boot'

const validManifest = parseAssetManifest(manifest)

function sources(): ReadonlyMap<string, SpriteTextureSource> {
  return new Map(manifest.assets.map((asset) => [asset.id, {
    image: {} as TexImageSource,
    width: asset.width,
    height: asset.height
  }]))
}

function harness(overrides: Partial<BootAdapters> = {}) {
  const recording = createRecordingSpriteRenderer()
  const audio = createNullAudio()
  const rendererDispose = vi.fn(() => recording.port.dispose())
  const canvasDispose = vi.fn()
  const audioDispose = vi.fn()
  const inputDispose = vi.fn()
  const driverStop = vi.fn()
  let hidden: (() => void) | undefined
  const adapters: BootAdapters = {
    loadAssets: vi.fn(async () => ({ manifest: validManifest, sources: sources() })),
    createSpriteRenderer: vi.fn(() => ({
      port: { ...recording.port, dispose: rendererDispose },
      scene: null as never,
      camera: null as never,
      resizeViewport: vi.fn()
    })),
    attachRenderer: vi.fn(async () => ({ renderFrame: vi.fn(), dispose: canvasDispose })),
    createAudio: vi.fn(() => ({ audio: audio.port, resume: vi.fn(), dispose: audioDispose })),
    createInput: vi.fn(() => ({
      movement: { read: () => ({ x: 0, y: 0 }), dispose: vi.fn() },
      read: () => ({ operate: false }),
      consume: () => ({ carryPressed: false, pausePressed: false }),
      dispose: inputDispose
    })),
    createStorage: vi.fn(() => memoryStorage()),
    startDriver: vi.fn((_loop, onHidden) => {
      hidden = onHidden
      return { stop: driverStop }
    }),
    createSeed: () => 73,
    ...overrides
  }
  return {
    adapters,
    recording,
    rendererDispose,
    canvasDispose,
    audioDispose,
    inputDispose,
    driverStop,
    hide: () => hidden?.()
  }
}

describe('browser boot seam', () => {
  let app: HTMLDivElement
  let runtime: BrowserGame | undefined

  beforeEach(() => {
    runtime?.dispose()
    runtime = undefined
    document.body.replaceChildren()
    app = document.createElement('div')
    app.id = 'app'
    document.body.append(app)
  })

  it('rejects a missing or invalid manifest before loading images', async () => {
    const loadImage = vi.fn()
    await expect(loadAssetSources(undefined, () => '/asset.png', loadImage)).rejects.toThrow(
      /missing asset manifest/i
    )
    await expect(loadAssetSources({ version: 2 }, () => '/asset.png', loadImage)).rejects.toThrow()
    expect(loadImage).not.toHaveBeenCalled()
  })

  it('reports a failed required image with its local asset path', async () => {
    const first = manifest.assets[0]!
    await expect(loadAssetSources(
      manifest,
      () => '/broken.png',
      async () => { throw new Error('decode failed') }
    )).rejects.toThrow(first.file)
  })

  it('falls back to in-memory progress when browser storage creation fails', async () => {
    const { adapters } = harness({ createStorage: () => { throw new Error('denied') } })
    runtime = await bootBrowserGame(app, adapters)
    expect(runtime.store.getState().progress.bestScore).toBe(0)
    expect(app.querySelector('.title')).not.toBeNull()
  })

  it('owns title, instructions, playing, and pause scene transitions', async () => {
    const { adapters } = harness()
    runtime = await bootBrowserGame(app, adapters)
    expect(app.querySelector('.title h1')?.textContent).toBe('LAST LIGHTKEEPER')

    app.querySelector<HTMLButtonElement>('.title-instructions')!.click()
    expect(runtime.store.getState().scene).toBe('instructions')
    expect(app.querySelector('.instructions')).not.toBeNull()
    app.querySelector<HTMLButtonElement>('.instructions-back')!.click()
    app.querySelector<HTMLButtonElement>('.title-start')!.click()
    expect(runtime.store.getState().scene).toBe('playing')
    expect(runtime.store.getState().night.seed).toBe(73)
    expect(app.querySelector<HTMLElement>('.hud')!.style.display).not.toBe('none')

    runtime.store.dispatch({ type: 'paused' })
    expect(app.querySelector('.pause')).not.toBeNull()
  })

  it('automatically pauses an active run when the loop driver reports hidden', async () => {
    const boot = harness()
    runtime = await bootBrowserGame(app, boot.adapters)
    app.querySelector<HTMLButtonElement>('.title-start')!.click()
    boot.hide()
    expect(runtime.store.getState().scene).toBe('paused')
  })

  it('tears down the loop, input, audio, renderer, views, and DOM exactly once', async () => {
    const boot = harness()
    runtime = await bootBrowserGame(app, boot.adapters)
    runtime.dispose()
    runtime.dispose()

    expect(boot.driverStop).toHaveBeenCalledTimes(1)
    expect(boot.inputDispose).toHaveBeenCalledTimes(1)
    expect(boot.audioDispose).toHaveBeenCalledTimes(1)
    expect(boot.canvasDispose).toHaveBeenCalledTimes(1)
    expect(boot.rendererDispose).toHaveBeenCalledTimes(1)
    expect(app.childElementCount).toBe(0)
  })
})
