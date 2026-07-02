import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  automata: { devPort: number }
}

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: pkg.automata.devPort, strictPort: true }
})
