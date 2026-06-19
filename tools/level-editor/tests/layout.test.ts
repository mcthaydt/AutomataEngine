import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('level editor host layout', () => {
  it('keeps DOM panels styled above a full-view tabbed canvas layer', () => {
    const html = readFileSync(resolve(toolRoot, 'index.html'), 'utf8')

    expect(html).toContain('#view-tabs')
    expect(html).toContain('.view-canvas')
    expect(html).toContain('.view-canvas.is-active')
    expect(html).toContain('#panels')
    expect(html).toContain('.panel')
    expect(html).not.toContain('canvas.map')
  })
})
