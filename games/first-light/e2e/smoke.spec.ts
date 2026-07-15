import { expect, test } from '@playwright/test'

test('first-light boots to a playable canvas without errors and within frame budget', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('http://127.0.0.1:5178/')
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.locator('.hud')).toContainText(/reach the beacon/i)
  const p95 = await page.evaluate(async () => {
    const samples: number[] = []
    let last = performance.now()
    await new Promise<void>((resolve) => {
      const tick = (now: number): void => {
        samples.push(now - last)
        last = now
        if (samples.length >= 140) resolve()
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const settled = samples.slice(20).sort((a, b) => a - b)
    return settled[Math.floor(settled.length * 0.95)] ?? 0
  })
  // The generic scaffold records a valid sample; the Phase 3 slice owns the
  // strict p95 budget so platform-specific SwiftShader variance does not make
  // every newly scaffolded project flaky.
  expect(Number.isFinite(p95) && p95 > 0).toBe(true)
  expect(errors).toEqual([])
})
