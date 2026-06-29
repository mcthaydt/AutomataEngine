import { expect, test } from '@playwright/test'

test('pulsebreak boots, starts a run, shows the HUD, and pauses/resumes', async ({ page }) => {
  const errors: string[] = []
  const failedRequests: string[] = []
  const projectResponses: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('requestfailed', (request) => failedRequests.push(request.url()))
  page.on('response', (response) => {
    if (response.url().includes('/project/')) projectResponses.push(response.url())
  })

  await page.goto('http://127.0.0.1:5176')

  await expect(page.locator('#overlays')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'PULSEBREAK' })).toBeVisible()
  expect(projectResponses.some((url) => url.endsWith('/project/automata.project.json'))).toBe(true)
  expect(projectResponses.some((url) => url.endsWith('/project/scenes/arena.scene.json'))).toBe(true)
  await page.getByRole('button', { name: 'Start Run' }).click()

  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.locator('.hud')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toHaveCount(0)
  await expect(page.locator('.hud')).toBeVisible()

  expect(errors).toEqual([])
  expect(failedRequests).toEqual([])
})
