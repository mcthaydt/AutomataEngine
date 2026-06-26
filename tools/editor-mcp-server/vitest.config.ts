import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'editor-mcp-server', environment: 'node', include: ['tests/**/*.test.ts'] }
})
