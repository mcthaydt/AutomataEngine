import { expect, test } from '@playwright/test'

test('pulsebreak boots, starts a run, shows the HUD, and pauses/resumes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('http://127.0.0.1:5176')

  await expect(page.locator('#overlays')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'PULSEBREAK' })).toBeVisible()
  await page.getByRole('button', { name: 'Start Run' }).click()

  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.locator('.hud')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toHaveCount(0)
  await expect(page.locator('.hud')).toBeVisible()

  expect(errors).toEqual([])
})
