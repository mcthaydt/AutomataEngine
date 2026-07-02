import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/style.css')

function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
}

function zIndex(css: string, selector: string): number {
  const match = /z-index\s*:\s*(\d+)/.exec(block(css, selector))
  return match ? Number(match[1]) : Number.NEGATIVE_INFINITY
}

describe('last lightkeeper presentation styles', () => {
  it('keeps a crisp 480x270 logical canvas with integer scale breakpoints', () => {
    const css = readFileSync(stylePath, 'utf8')
    const canvas = block(css, '.game-canvas')
    expect(canvas).toMatch(/width\s*:\s*480px/)
    expect(canvas).toMatch(/height\s*:\s*270px/)
    expect(canvas).toMatch(/aspect-ratio\s*:\s*16\s*\/\s*9/)
    expect(canvas).toMatch(/image-rendering\s*:\s*pixelated/)
    expect(css).toContain('(min-width: 960px) and (min-height: 540px)')
    expect(css).toContain('(min-width: 1440px) and (min-height: 810px)')
  })

  it('keeps safe-area HUD text below overlays with compact responsive rules', () => {
    const css = readFileSync(stylePath, 'utf8')
    const hud = block(css, '.hud')
    expect(hud).toContain('safe-area-inset-top')
    expect(hud).toMatch(/grid-template-columns\s*:\s*repeat\(4,/)
    expect(hud).toMatch(/max-width\s*:\s*1200px/)
    expect(hud).not.toMatch(/transform\s*:/)
    expect(zIndex(css, '#overlays')).toBeGreaterThan(zIndex(css, '.hud'))
    expect(css).toContain('@media (max-width: 700px)')
    expect(css).toContain('prefers-reduced-motion')
  })
})
