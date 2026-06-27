import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'pulsebreak', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
