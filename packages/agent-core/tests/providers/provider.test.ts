import { describe, it, expect } from 'vitest'
import '../../src/providers/provider'
import type { ProviderAdapter, ProviderResponse } from '../../src/providers/provider'

// A trivial adapter proves the interface is implementable and the normalized
// shapes compose. Real wire adapters land in later tasks.
const echo: ProviderAdapter = {
  id: 'anthropic',
  defaultModel: 'claude-opus-4-8',
  async send(req) {
    const response: ProviderResponse = {
      text: `saw ${req.messages.length} messages and ${req.tools.length} tools`,
      toolCalls: [],
      stopReason: 'end'
    }
    return response
  }
}

describe('ProviderAdapter', () => {
  it('round-trips a normalized request through send', async () => {
    const res = await echo.send({
      system: 'sys',
      messages: [{ role: 'user', text: 'hi' }],
      tools: [{ name: 'getDoc', description: 'read', schema: {} }]
    })
    expect(res.text).toBe('saw 1 messages and 1 tools')
    expect(res.stopReason).toBe('end')
    expect(echo.id).toBe('anthropic')
    expect(echo.defaultModel).toBe('claude-opus-4-8')
  })
})
