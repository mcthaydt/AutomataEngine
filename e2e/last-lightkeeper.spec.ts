import { expect, test } from '@playwright/test'

interface KeeperSnapshot {
  scene: string
  timeS: number
  x: number
  floor: string
  activeCallId: string | null
  callStatus: string | null
  rescues: number
  beaconBearingDeg: number
  circuits: Record<string, { requested: boolean; powered: boolean; tripped: boolean }>
}

async function advanceBy(page: import('@playwright/test').Page, seconds: number): Promise<void> {
  await page.evaluate((delta) => {
    window.__LAST_LIGHTKEEPER_TEST__!.step(delta)
  }, seconds)
}

declare global {
  interface Window {
    __LAST_LIGHTKEEPER_TEST__?: {
      snapshot(): KeeperSnapshot
      advanceTimeTo(timeS: number): void
      step(seconds: number): void
    }
  }
}

test('last lightkeeper boots, moves, interacts, and pauses without browser errors', async ({ page }) => {
  const errors: string[] = []
  const failedRequests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('requestfailed', (request) => failedRequests.push(request.url()))

  await page.goto('http://127.0.0.1:5177/?e2e=1')
  await expect(page.getByRole('heading', { name: 'LAST LIGHTKEEPER' })).toBeVisible()
  await page.getByRole('button', { name: 'Instructions' }).click()
  await expect(page.getByRole('heading', { name: 'KEEPER HANDBOOK' })).toBeVisible()
  await expect(page.locator('.rescue-loop li')).toHaveCount(6)
  await page.getByRole('button', { name: 'Back to Title' }).click()
  await page.getByRole('button', { name: 'Start Night' }).click()

  await expect(page.locator('canvas.game-canvas')).toBeVisible()
  await expect(page.locator('.hud')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__LAST_LIGHTKEEPER_TEST__?.snapshot().x))
    .toBe(0)
  await expect(page.locator('.hud-prompt')).toContainText('Operate Breaker Panel')

  await page.keyboard.down('KeyD')
  await expect.poll(() => page.evaluate(() => window.__LAST_LIGHTKEEPER_TEST__?.snapshot().x))
    .toBeGreaterThan(0)
  await page.keyboard.up('KeyD')
  await page.keyboard.press('KeyE')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'STORM PAUSED' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('heading', { name: 'STORM PAUSED' })).toHaveCount(0)

  expect(errors).toEqual([])
  expect(failedRequests).toEqual([])
})

test('routes power and completes the first rescue through real controls', async ({ page }) => {
  const errors: string[] = []
  const failedRequests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('requestfailed', (request) => failedRequests.push(request.url()))
  await page.goto('http://127.0.0.1:5177/?e2e=1')
  await page.getByRole('button', { name: 'Start Night' }).click()

  // Request workshop, then cycle back to beacon/radio-first priority.
  for (let index = 0; index < 4; index++) {
    await page.keyboard.down('KeyE')
    await advanceBy(page, 0.05)
    await page.keyboard.up('KeyE')
  }
  await expect.poll(() => page.evaluate(() => window.__LAST_LIGHTKEEPER_TEST__!.snapshot().circuits))
    .toMatchObject({
      workshop: { requested: true, powered: false },
      beacon: { requested: true, powered: true },
      radio: { requested: true, powered: true },
      bilge: { requested: true, powered: true }
    })

  // Quarters -> navigation radio using the authored ladder and keyboard movement.
  await page.keyboard.down('KeyD')
  await advanceBy(page, 52 / 48)
  await page.keyboard.up('KeyD')
  await page.keyboard.down('KeyW')
  await advanceBy(page, 1.5)
  await page.keyboard.up('KeyW')
  await page.keyboard.down('KeyA')
  await advanceBy(page, 80 / 48)
  await page.keyboard.up('KeyA')
  await expect.poll(() => page.evaluate(() => window.__LAST_LIGHTKEEPER_TEST__!.snapshot()))
    .toMatchObject({ floor: 'navigation' })
  await expect(page.locator('.hud-prompt')).toContainText('Operate Radio')

  // Let the first call arrive, then acknowledge and identify it at the powered radio.
  await page.evaluate(() => window.__LAST_LIGHTKEEPER_TEST__!.advanceTimeTo(45))
  await page.keyboard.down('KeyE')
  await advanceBy(page, 4.2)
  await page.keyboard.up('KeyE')
  await expect.poll(() => page.evaluate(() => window.__LAST_LIGHTKEEPER_TEST__!.snapshot()))
    .toMatchObject({ activeCallId: 'mercy-bell', callStatus: 'bearingKnown' })

  // Navigation -> lantern beacon, wait for the rescue window, aim, and hold the light.
  await page.keyboard.down('KeyA')
  await advanceBy(page, 12 / 48)
  await page.keyboard.up('KeyA')
  await page.keyboard.down('KeyW')
  await advanceBy(page, 1.5)
  await page.keyboard.up('KeyW')
  await page.keyboard.down('KeyD')
  await advanceBy(page, 60 / 48)
  await page.keyboard.up('KeyD')
  await expect(page.locator('.hud-prompt')).toContainText('Operate Beacon Controls')
  await page.evaluate(() => window.__LAST_LIGHTKEEPER_TEST__!.advanceTimeTo(85))

  await page.keyboard.down('KeyE')
  await page.keyboard.down('KeyS')
  await advanceBy(page, 28 / 60)
  await page.keyboard.up('KeyS')
  await expect.poll(() => page.evaluate(() => window.__LAST_LIGHTKEEPER_TEST__!.snapshot().beaconBearingDeg))
    .toBeCloseTo(-28, 1)
  await advanceBy(page, 5.1)
  await page.keyboard.up('KeyE')

  await expect.poll(() => page.evaluate(() => window.__LAST_LIGHTKEEPER_TEST__!.snapshot().rescues))
    .toBe(1)
  await expect(page.locator('.hud-rescues')).toContainText('1/3')
  expect(errors).toEqual([])
  expect(failedRequests).toEqual([])
})
