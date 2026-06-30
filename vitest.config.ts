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
      exclude: [
        '**/main.ts',
        'packages/engine/src/loop/browser.ts',
        'packages/engine/src/render/browser.ts'
      ],
      thresholds: { lines: 90, branches: 90 }
    }
  }
})
