import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'pack-dialogue-quests', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }
})
