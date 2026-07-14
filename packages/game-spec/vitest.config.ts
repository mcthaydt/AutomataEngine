import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'game-spec', environment: 'node', include: ['tests/**/*.test.ts'] }
})
