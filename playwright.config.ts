import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    headless: true,
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    }
  },
  webServer: [
    { command: 'npm run dev:game', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev:editor', url: 'http://127.0.0.1:5175', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev:pulsebreak', url: 'http://127.0.0.1:5176', reuseExistingServer: !process.env.CI }
  ]
})
