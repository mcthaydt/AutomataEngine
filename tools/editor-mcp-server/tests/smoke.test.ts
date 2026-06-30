import { describe, expect, it } from 'vitest'
import { PROJECT_GAME_IDS } from '../src/projectCatalog'

describe('editor-mcp-server package', () => {
  it('exposes both shipped projects without requiring browser globals', () => {
    expect(PROJECT_GAME_IDS).toEqual(['monkey-ball', 'pulsebreak'])
    expect('window' in globalThis).toBe(false)
    expect('document' in globalThis).toBe(false)
    expect('localStorage' in globalThis).toBe(false)
  })
})
