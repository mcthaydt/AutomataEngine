import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'pack-registry', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
