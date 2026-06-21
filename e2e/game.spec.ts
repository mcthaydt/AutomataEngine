import { expect, test } from '@playwright/test'

test('game boots to the menu and starts a level', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174')

  await expect(page.locator('#overlays')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
  await page.getByRole('button', { name: 'Play' }).click()
  await page.locator('[data-level-id="w1-l1"]').click()

  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.locator('.hud')).toBeVisible()
})
