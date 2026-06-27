import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'games/*', 'tools/*'],
    coverage: {
      provider: 'istanbul',
      include: [
        'packages/engine/src/**',
        'packages/editor/src/**',
        'packages/editor-agent/src/**',
        'packages/contracts/src/**',
        'packages/agent-core/src/**',
        'games/monkey-ball/src/**',
        'tools/editor-mcp-server/src/**'
      ],
      exclude: ['**/main.ts', '**/browser.ts', '**/index.ts', '**/version.ts'],
      thresholds: { lines: 90, branches: 90 }
    }
  }
})
