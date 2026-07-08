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
        'packages/engine/src/render/browser.ts',
        // Injected process/browser boundary for durable sessions: drives real
        // npm + Chromium, so it has no unit coverage by design (see AGENTS.md
        // untested-shim inventory), exercised only by the manual session smoke.
        'tools/editor-mcp-server/src/session/adapters.ts'
      ],
      thresholds: { lines: 90, branches: 90 }
    }
  }
})
