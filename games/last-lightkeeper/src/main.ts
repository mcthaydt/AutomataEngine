import manifest from '../assets/manifest.json'
import './style.css'

import { bootBrowserGame, createDefaultBootAdapters } from './main/boot'

const app = document.getElementById('app')

if (app !== null) {
  const testMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('e2e') === '1'
  const adapters = createDefaultBootAdapters(
    manifest,
    (file) => new URL(file, document.baseURI).href
  )
  if (testMode) {
    const seedParam = new URLSearchParams(window.location.search).get('seed')
    const requestedSeed = seedParam === null ? Number.NaN : Number(seedParam)
    adapters.createSeed = () => Number.isInteger(requestedSeed) && requestedSeed >= 0
      ? requestedSeed >>> 0
      : 42
  }
  void bootBrowserGame(app, adapters).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const panel = document.createElement('div')
    panel.className = 'overlay boot-error'
    panel.textContent = `Failed to start LAST LIGHTKEEPER: ${message}`
    app.replaceChildren(panel)
  })
}
