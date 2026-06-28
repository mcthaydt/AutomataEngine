import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'games/*', 'tools/*'],
    coverage: {
      provider: 'istanbul',
      include: [
        'packages/*/src/**',
        'games/*/src/**',
        'tools/*/src/**'
      ],
      exclude: ['**/main.ts', '**/browser.ts', '**/index.ts', '**/version.ts', 'tools/level-editor/**'],
      thresholds: { lines: 90, branches: 90 }
    }
  }
})
