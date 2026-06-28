import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'game-kit', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
