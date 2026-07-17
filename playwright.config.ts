import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * Dev servers derive from workspace conventions: any games/* or tools/*
 * package declaring `automata.devPort` is served. `PLAYWRIGHT_ONLY=<name>`
 * narrows to one workspace. No per-game edits belong in this file.
 */
function workspaceServers(): Array<{ name: string; port: number }> {
  const servers: Array<{ name: string; port: number }> = []
  for (const group of ['games', 'tools']) {
    for (const entry of readdirSync(group, { withFileTypes: true })) {
      const manifestPath = join(group, entry.name, 'package.json')
      if (!entry.isDirectory() || !existsSync(manifestPath)) continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        name: string
        automata?: { devPort?: number }
      }
      const port = manifest.automata?.devPort
      if (typeof port === 'number') servers.push({ name: manifest.name, port })
    }
  }
  return servers.sort((a, b) => a.port - b.port)
}

const only = process.env.PLAYWRIGHT_ONLY
const servers = workspaceServers().filter((server) => !only || server.name === only)
if (servers.length === 0) {
  throw new Error(`PLAYWRIGHT_ONLY="${only}" matches no workspace with automata.devPort`)
}

export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'games/*/e2e/**/*.spec.ts'],
  timeout: 30_000,
  // Frame-budget specs measure scheduler latency; parallel browsers make that
  // signal describe host contention rather than the game under test.
  workers: 1,
  use: {
    headless: true,
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    }
  },
  webServer: servers.map((server) => ({
    command: `npm run dev -w ${server.name}`,
    url: `http://127.0.0.1:${server.port}`,
    reuseExistingServer: !process.env.CI
  }))
})
