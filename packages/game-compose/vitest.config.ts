import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'game-compose', environment: 'node', include: ['tests/**/*.test.ts'] }
})
