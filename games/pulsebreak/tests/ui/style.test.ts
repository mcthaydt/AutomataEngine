import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/style.css')

function declarationBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  return match?.[1] ?? ''
}

function zIndex(css: string, selector: string): number {
  const match = /z-index\s*:\s*(\d+)/.exec(declarationBlock(css, selector))
  return match ? Number(match[1]) : Number.NEGATIVE_INFINITY
}

describe('pulsebreak styles', () => {
  it('layers overlays above the HUD and joystick', () => {
    const css = readFileSync(stylePath, 'utf8')
    expect(zIndex(css, '#overlays')).toBeGreaterThan(zIndex(css, '.hud'))
    expect(zIndex(css, '#overlays')).toBeGreaterThan(zIndex(css, '.joystick'))
  })

  it('respects reduced motion', () => {
    const css = readFileSync(stylePath, 'utf8')
    expect(css).toContain('prefers-reduced-motion')
  })
})
