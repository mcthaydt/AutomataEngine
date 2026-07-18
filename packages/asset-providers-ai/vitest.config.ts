import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'asset-providers-ai', environment: 'node', include: ['tests/**/*.test.ts'] }
})
