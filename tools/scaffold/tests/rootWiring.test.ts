import { describe, expect, it } from 'vitest'
import { wirePackageJson, wirePlaywrightConfig } from '../src/rootWiring'

const packageJson = `${JSON.stringify({
  name: 'repo',
  scripts: {
    test: 'vitest run',
    build: 'npm run build -w monkey-ball && npm run build -w pulsebreak'
  }
}, null, 2)}\n`

const playwrightConfig = `import { defineConfig } from '@playwright/test'

export default defineConfig({
  webServer: [
    { command: 'npm run dev:game', url: 'http://127.0.0.1:5174' }
  ]
})
`

describe('wirePackageJson', () => {
  it('adds root dev and build scripts for the game', () => {
    const wired = JSON.parse(wirePackageJson(packageJson, 'starfall', 5188)) as {
      scripts: Record<string, string>
    }
    expect(wired.scripts['dev:starfall']).toBe(
      'npm run dev -w starfall -- --host 127.0.0.1 --port 5188 --strictPort'
    )
    expect(wired.scripts.build).toBe(
      'npm run build -w monkey-ball && npm run build -w pulsebreak && npm run build -w starfall'
    )
  })

  it('rejects duplicate or malformed root scripts', () => {
    const duplicate = JSON.stringify({ scripts: { build: 'build', 'dev:starfall': 'dev' } })
    expect(() => wirePackageJson(duplicate, 'starfall', 5188)).toThrow(/already wired/i)
    expect(() => wirePackageJson('{}', 'starfall', 5188)).toThrow(/scripts/i)
  })
})

describe('wirePlaywrightConfig', () => {
  it('appends the game server without removing existing servers', () => {
    const wired = wirePlaywrightConfig(playwrightConfig, 'starfall', 5188)
    expect(wired).toContain("command: 'npm run dev:game'")
    expect(wired).toContain(
      "{ command: 'npm run dev:starfall', url: 'http://127.0.0.1:5188', reuseExistingServer: !process.env.CI }"
    )
  })

  it('rejects duplicate or malformed Playwright configuration', () => {
    const duplicate = playwrightConfig.replace('dev:game', 'dev:starfall')
    expect(() => wirePlaywrightConfig(duplicate, 'starfall', 5188)).toThrow(/already wired/i)
    expect(() => wirePlaywrightConfig('export default {}', 'starfall', 5188)).toThrow(/webServer/i)
  })

  it('rejects a port already used by another Playwright server', () => {
    const collision = playwrightConfig.replace('5174', '5188')
    expect(() => wirePlaywrightConfig(collision, 'starfall', 5188)).toThrow(/port 5188.*already/i)
  })

  it('does not confuse prefix-matching game names or ports with duplicates', () => {
    const distinct = playwrightConfig
      .replace('dev:game', 'dev:starfall-extra')
      .replace('5174', '51880')
    expect(wirePlaywrightConfig(distinct, 'starfall', 5188)).toContain("command: 'npm run dev:starfall'")
  })
})
