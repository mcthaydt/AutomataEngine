import { readFile, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { resolveGameAssetPath } from './src/dev-assets'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  automata: { devPort: number }
}

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig({
  base: './',
  publicDir: false,
  server: { host: '127.0.0.1', port: pkg.automata.devPort, strictPort: true },
  plugins: [
    {
      name: 'automata-game-assets',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const filePath = req.url ? resolveGameAssetPath(repoRoot, req.url) : null
          if (!filePath) return next()
          readFile(filePath, (error, body) => {
            if (error) {
              res.statusCode = 404
              res.end()
              return
            }
            res.setHeader('Content-Type', filePath.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8')
            res.end(body)
          })
        })
      }
    }
  ]
})
