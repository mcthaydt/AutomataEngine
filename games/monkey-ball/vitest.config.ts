import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'monkey-ball', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
