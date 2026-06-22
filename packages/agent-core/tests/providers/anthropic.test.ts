import { describe, it, expect } from 'vitest'
import { createAnthropicAdapter, type AnthropicMessagesClient } from '../../src/providers/anthropic'

function fakeClient(response: unknown): { client: AnthropicMessagesClient; bodies: unknown[] } {
  const bodies: unknown[] = []
  const client: AnthropicMessagesClient = {
    messages: {
      create: async (body) => {
        bodies.push(body)
        return response as never
      }
    }
  }
  return { client, bodies }
}

describe('anthropic adapter', () => {
  it('constructs the default browser-enabled client when none is injected', () => {
    const adapter = createAnthropicAdapter({ apiKey: 'k' })
    expect(adapter.id).toBe('anthropic')
    expect(adapter.defaultModel).toBe('claude-opus-4-8')
  })

  it('translates the request to messages.create body with adaptive thinking + tool schemas', async () => {
    const { client, bodies } = fakeClient({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' })
    const adapter = createAnthropicAdapter({ apiKey: 'k', client })
    await adapter.send({
      system: 'be helpful',
      messages: [{ role: 'user', text: 'add a box' }],
      tools: [{ name: 'addItem', description: 'add', schema: { type: 'object' } }]
    })
    expect(bodies).toHaveLength(1)
    const body = bodies[0] as Record<string, unknown>
    expect(body.model).toBe('claude-opus-4-8')
    expect(body.max_tokens).toBe(16000)
    expect(body.thinking).toEqual({ type: 'adaptive' })
    expect(body.system).toBe('be helpful')
    expect(body.tools).toEqual([{ name: 'addItem', description: 'add', input_schema: { type: 'object' } }])
    expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'add a box' }] }])
  })

  it('parses a tool_use response into normalized tool calls', async () => {
    const { client } = fakeClient({
      content: [
        { type: 'text', text: 'placing it' },
        { type: 'tool_use', id: 'tu_1', name: 'addItem', input: { item: { id: 'box:9' } } }
      ],
      stop_reason: 'tool_use'
    })
    const adapter = createAnthropicAdapter({ apiKey: 'k', client })
    const res = await adapter.send({ system: '', messages: [{ role: 'user', text: 'go' }], tools: [] })
    expect(res.text).toBe('placing it')
    expect(res.stopReason).toBe('tool_use')
    expect(res.toolCalls).toEqual([{ id: 'tu_1', name: 'addItem', args: { item: { id: 'box:9' } } }])
  })

  it('encodes an assistant tool-call turn and a tool-result turn', async () => {
    const { client, bodies } = fakeClient({ content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' })
    const adapter = createAnthropicAdapter({ apiKey: 'k', client })
    await adapter.send({
      system: '',
      messages: [
        { role: 'user', text: 'go' },
        { role: 'assistant', text: 'calling', toolCalls: [{ id: 'tu_1', name: 'addItem', args: { a: 1 } }] },
        { role: 'tool', text: '{"ok":true}', toolCallId: 'tu_1' }
      ],
      tools: []
    })
    const body = bodies[0] as { messages: unknown[] }
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'go' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'calling' },
          { type: 'tool_use', id: 'tu_1', name: 'addItem', input: { a: 1 } }
        ]
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '{"ok":true}' }] }
    ])
  })

  it('encodes an assistant turn without text or tool calls as empty content', async () => {
    const { client, bodies } = fakeClient({ content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' })
    const adapter = createAnthropicAdapter({ apiKey: 'k', client })
    await adapter.send({ system: '', messages: [{ role: 'assistant', text: '' }], tools: [] })
    const body = bodies[0] as { messages: unknown[] }
    expect(body.messages).toEqual([{ role: 'assistant', content: [] }])
  })

  it('defaults missing tool metadata to empty strings', async () => {
    const { client } = fakeClient({ content: [{ type: 'tool_use', input: { ok: true } }], stop_reason: 'tool_use' })
    const adapter = createAnthropicAdapter({ apiKey: 'k', client })
    const res = await adapter.send({ system: '', messages: [{ role: 'user', text: 'go' }], tools: [] })
    expect(res.toolCalls).toEqual([{ id: '', name: '', args: { ok: true } }])
  })

  it('maps a refusal/length stop to "other"', async () => {
    const { client } = fakeClient({ content: [], stop_reason: 'refusal' })
    const adapter = createAnthropicAdapter({ apiKey: 'k', client })
    const res = await adapter.send({ system: '', messages: [{ role: 'user', text: 'x' }], tools: [] })
    expect(res.stopReason).toBe('other')
    expect(res.text).toBe('')
  })
})
