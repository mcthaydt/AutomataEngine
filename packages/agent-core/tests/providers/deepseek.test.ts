import { describe, it, expect } from 'vitest'
import { createDeepSeekAdapter, DEFAULT_DEEPSEEK_MODEL } from '../../src/providers/deepseek'
import type { OpenAiChatClient } from '../../src/providers/openai'

describe('deepseek adapter', () => {
  it('reuses the OpenAI wire shape, defaults to the deepseek model, and reports id "deepseek"', async () => {
    const bodies: unknown[] = []
    const client: OpenAiChatClient = {
      chat: {
        completions: {
          create: async (body) => {
            bodies.push(body)
            return { choices: [{ message: { content: 'hi', tool_calls: [] }, finish_reason: 'stop' }] } as never
          }
        }
      }
    }
    const adapter = createDeepSeekAdapter({ apiKey: 'k', client })
    expect(adapter.id).toBe('deepseek')
    expect(adapter.defaultModel).toBe(DEFAULT_DEEPSEEK_MODEL)
    await adapter.send({ system: '', messages: [{ role: 'user', text: 'go' }], tools: [] })
    expect((bodies[0] as { model: string }).model).toBe(DEFAULT_DEEPSEEK_MODEL)
  })
})
