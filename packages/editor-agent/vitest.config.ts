import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'editor-agent', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
