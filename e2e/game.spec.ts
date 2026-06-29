import { expect, test } from '@playwright/test'

test('game boots to the menu and starts a level', async ({ page }) => {
  const errors: string[] = []
  const failedRequests: string[] = []
  const responses: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('requestfailed', (request) => failedRequests.push(request.url()))
  page.on('response', (response) => responses.push(response.url()))

  await page.goto('http://127.0.0.1:5174')

  await expect(page.locator('#overlays')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
  await page.getByRole('button', { name: 'Play' }).click()
  await page.locator('[data-level-id="w1-l1"]').click()

  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.locator('.hud')).toBeVisible()
  expect(responses.some((url) => url.endsWith('/project/automata.project.json'))).toBe(true)
  expect(responses.some((url) => url.endsWith('/project/scenes/w1-l1.scene.json'))).toBe(true)
  expect(responses.some((url) => url.includes('/data/levels/'))).toBe(false)
  expect(responses.some((url) => url.endsWith('/data/config/physics.toml'))).toBe(false)
  expect(errors).toEqual([])
  expect(failedRequests).toEqual([])
})
