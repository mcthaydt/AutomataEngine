import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { BrowserSmokeFn, ExecFn } from './runner'

/** Run a command, capturing stdout/stderr and the exit code. The process boundary. */
export const nodeExec: ExecFn = (cmd, args, cwd) =>
  new Promise((resolve) => {
    const child = spawn(cmd, [...args], { cwd, shell: false })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}` }))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })

/** Poll an HTTP endpoint until it answers or the deadline passes. */
async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try { if ((await fetch(url)).ok) return } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`server at ${url} did not become ready`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

/**
 * Boot the built game under Playwright and capture boot/console/frame-time.
 * The browser boundary: it drives a real dev server + Chromium, so it has NO
 * unit coverage and is exercised only by the Task 9 manual smoke. Serves
 * `<gameDir>/dist` via `vite preview` on the game's declared automata.devPort
 * and polls readiness (no stdout scraping).
 */
export const playwrightBrowserSmoke: BrowserSmokeFn = async ({ gameDir, screenshotPath }) => {
  const { chromium } = await import('@playwright/test')
  const manifest = JSON.parse(await readFile(join(gameDir, 'package.json'), 'utf8')) as { automata?: { devPort?: number } }
  const port = manifest.automata?.devPort ?? 4173
  const url = `http://localhost:${port}`
  const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: gameDir })
  const consoleErrors: string[] = []
  try {
    await waitForServer(url, 15_000)
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    try {
      const page = await browser.newPage()
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
      page.on('pageerror', (err) => consoleErrors.push(err.message))
      await page.goto(url, { waitUntil: 'load', timeout: 15_000 })
      const frameMs = await page.evaluate(() => new Promise<number[]>((resolve) => {
        const times: number[] = []
        let last = performance.now()
        const tick = (t: number) => { times.push(t - last); last = t; if (times.length < 10) requestAnimationFrame(tick); else resolve(times) }
        requestAnimationFrame(tick)
      }))
      await mkdir(dirname(screenshotPath), { recursive: true })
      await page.screenshot({ path: screenshotPath })
      return { booted: true, consoleErrors, frameMs, screenshotPath }
    } finally {
      await browser.close()
    }
  } catch (error) {
    return { booted: false, consoleErrors: [...consoleErrors, error instanceof Error ? error.message : String(error)], frameMs: [], screenshotPath: null }
  } finally {
    preview.kill()
  }
}
