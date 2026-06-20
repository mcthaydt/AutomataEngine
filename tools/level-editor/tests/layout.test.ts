import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('level editor host shell', () => {
  it('is a minimal mount point - chrome + theme come from @automata/editor', () => {
    const html = readFileSync(resolve(toolRoot, 'index.html'), 'utf8')
    expect(html).toContain('id="app"')
    expect(html).not.toContain('#view-tabs')
    expect(html).not.toContain('.view-canvas')
    expect(html).not.toContain('#panels')
  })
})
