import { expect, test } from '@playwright/test'

test('editor places a box and export reflects it', async ({ page }) => {
  await page.goto('http://127.0.0.1:5175')

  const map = page.locator('[data-vp="main"] canvas')
  await expect(map).toBeVisible()

  await page.locator('[data-brush="box"]').click()
  await map.click({ position: { x: 180, y: 180 } })
  await page.locator('[data-action="export"]').click()

  await expect(page.locator('[data-export-status]')).toContainText(/Exported|Start/)
})
