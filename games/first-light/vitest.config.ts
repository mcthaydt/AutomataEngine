import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'first-light', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
