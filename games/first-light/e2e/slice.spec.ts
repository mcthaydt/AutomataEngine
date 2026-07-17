import { expect, test } from '@playwright/test'

test('first-light composes the inventory pack: HUD, icon, manifest, and frame budget', async ({ page }) => {
  await page.goto('http://127.0.0.1:5178/')
  await expect(page.locator('canvas')).toBeVisible()
  const hud = page.locator('.inventory-hud')
  await expect(hud).toContainText('0/2')
  const icon = hud.locator('img')
  await expect(icon).toHaveJSProperty('complete', true)
  expect(await icon.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  expect(await page.evaluate(async () => (await fetch('project/composition.json')).ok)).toBe(true)

  const p95 = await page.evaluate(async () => {
    const samples: number[] = []
    let last = performance.now()
    await new Promise<void>((resolve) => {
      const tick = (now: number): void => {
        samples.push(now - last); last = now
        if (samples.length >= 140) resolve(); else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const settled = samples.slice(20).sort((a, b) => a - b)
    return settled[Math.floor(settled.length * 0.95)] ?? 0
  })
  expect(p95).toBeLessThan(50)
})
