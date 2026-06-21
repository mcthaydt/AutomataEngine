import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'games/*', 'tools/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/engine/src/**', 'packages/editor/src/**', 'packages/contracts/src/**'],
      exclude: ['**/browser.ts', '**/index.ts', '**/version.ts'],
      thresholds: { lines: 90, branches: 90 }
    }
  }
})
