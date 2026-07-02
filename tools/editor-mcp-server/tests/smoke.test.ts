import { describe, expect, it } from 'vitest'
import { discoverGames } from '../src/projectCatalog'

describe('editor-mcp-server package', () => {
  it('discovers both shipped projects without requiring browser globals', async () => {
    await expect(discoverGames()).resolves.toEqual(['monkey-ball', 'pulsebreak'])
    expect('window' in globalThis).toBe(false)
    expect('document' in globalThis).toBe(false)
    expect('localStorage' in globalThis).toBe(false)
  })
})
