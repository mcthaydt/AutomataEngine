import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'build-session', environment: 'node', include: ['tests/**/*.test.ts'] }
})
