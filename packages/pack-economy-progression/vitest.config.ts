import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'pack-economy-progression',
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts']
  }
})
