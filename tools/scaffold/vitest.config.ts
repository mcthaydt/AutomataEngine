import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'scaffold', environment: 'node', include: ['tests/**/*.test.ts'] }
})
