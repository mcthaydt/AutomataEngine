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

test('recovers an autosaved edit and can discard it back to disk state', async ({ page }) => {
  await page.goto('http://127.0.0.1:5175/?game=pulsebreak')
  await page.evaluate(() => localStorage.clear())
  await page.evaluate(async () => {
    const prefix = '/games/pulsebreak/public/project/'
    const manifest = await (await fetch(`${prefix}automata.project.json`)).json()
    const scenes = await Promise.all(manifest.scenes.map(async (entry: { path: string }) => {
      const scene = await (await fetch(`${prefix}${entry.path}`)).json()
      return { ...scene, name: 'Recovered Arena' }
    }))
    const resources = await Promise.all(manifest.resources.map(async (entry: { path: string }) =>
      (await fetch(`${prefix}${entry.path}`)).json()
    ))
    localStorage.setItem('automata/project-autosave/pulsebreak', JSON.stringify({ manifest, scenes, resources }))
  })
  await page.getByRole('button', { name: 'Create Pulsebreak Project' }).click()

  await expect(page.locator('[data-recovery-notice]')).toContainText('Recovered unsaved changes')
  await page.getByRole('button', { name: 'Discard recovered changes' }).click()
  await expect(page.locator('[data-recovery-notice]')).toBeHidden()
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('automata/project-autosave/pulsebreak')
    return raw ? JSON.parse(raw).scenes[0].name : ''
  })).toBe('Arena')
})

test('survives a long editing session without console errors', async ({ page }) => {
  const ignore = [/WebGL/i, /favicon/i, /Failed to load resource/i]
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !ignore.some((pattern) => pattern.test(message.text()))) errors.push(message.text())
  })
  page.on('pageerror', (error) => {
    if (!ignore.some((pattern) => pattern.test(error.message))) errors.push(error.message)
  })

  await page.goto('http://127.0.0.1:5175/?game=pulsebreak')
  await page.getByRole('button', { name: 'Create Pulsebreak Project' }).click()
  await page.getByText('arena').click()
  await page.getByText('Spawn Zone').click()

  const canvas = page.locator('[data-vp="main"] canvas')
  for (let index = 0; index < 20; index++) {
    await canvas.click({ position: { x: 120 + (index % 5) * 30, y: 120 + Math.floor(index / 5) * 30 } })
  }
  for (let index = 0; index < 10; index++) await page.keyboard.press('Control+z')
  for (let index = 0; index < 10; index++) await page.keyboard.press('Control+Shift+z')

  await page.getByRole('button', { name: 'Export Bundle' }).click()
  await expect(page.locator('[data-save-status]')).toContainText(/Exported/)
  expect(errors).toEqual([])
})
