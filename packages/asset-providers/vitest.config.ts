import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'asset-providers', include: ['tests/**/*.test.ts'] }
})
