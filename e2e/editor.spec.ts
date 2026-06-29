import { expect, test } from '@playwright/test'

test('creates and edits a Pulsebreak project', async ({ page }) => {
  await page.goto('http://127.0.0.1:5175/?game=pulsebreak')
  await page.getByRole('button', { name: 'Create Pulsebreak Project' }).click()
  await page.getByText('arena').click()
  await page.getByText('Spawn Zone').click()
  await page.locator('[data-vp="main"] canvas').click({ position: { x: 180, y: 180 } })
  await page.getByRole('button', { name: 'Export Bundle' }).click()
  await expect(page.locator('[data-save-status]')).toContainText(/Exported/)
})

test('opens Monkey Ball in the same editor shell', async ({ page }) => {
  await page.goto('http://127.0.0.1:5175/?game=monkey-ball')
  await page.getByRole('button', { name: 'Create Monkey Ball Project' }).click()
  await expect(page.locator('[data-project-hierarchy]')).toContainText('w1-l1')
  await expect(page.locator('[data-project-resources]')).toContainText('Physics')
})
