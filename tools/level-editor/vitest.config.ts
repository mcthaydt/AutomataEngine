import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'level-editor', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
