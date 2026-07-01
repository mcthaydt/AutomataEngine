import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'last-lightkeeper', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
