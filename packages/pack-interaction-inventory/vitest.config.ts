import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'pack-interaction-inventory', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
