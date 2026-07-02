import manifest from '../assets/manifest.json'
import './style.css'

import { bootBrowserGame, createDefaultBootAdapters } from './main/boot'

const assetUrls = import.meta.glob('../assets/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

const app = document.getElementById('app')

if (app !== null) {
  const adapters = createDefaultBootAdapters(
    manifest,
    (file) => assetUrls[`../${file}`]
  )
  void bootBrowserGame(app, adapters).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const panel = document.createElement('div')
    panel.className = 'overlay boot-error'
    panel.textContent = `Failed to start LAST LIGHTKEEPER: ${message}`
    app.replaceChildren(panel)
  })
}
