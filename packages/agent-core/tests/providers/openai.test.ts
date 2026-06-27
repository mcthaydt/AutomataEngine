import { describe, it, expect } from 'vitest'
import { createOpenAiAdapter, type OpenAiChatClient } from '../../src/providers/openai'

function fakeClient(response: unknown): { client: OpenAiChatClient; bodies: unknown[] } {
  const bodies: unknown[] = []
  const client: OpenAiChatClient = {
    chat: { completions: { create: async (body) => { bodies.push(body); return response as never } } }
  }
  return { client, bodies }
}

describe('openai adapter', () => {
  it('constructs the default browser-enabled client when none is injected', () => {
    const adapter = createOpenAiAdapter({ apiKey: 'k' })
    expect(adapter.id).toBe('openai')
    expect(adapter.defaultModel).toBe('gpt-5')
  })

  it('translates the request to a chat.completions body with function tools', async () => {
    const { client, bodies } = fakeClient({
      choices: [{ message: { content: 'ok', tool_calls: [] }, finish_reason: 'stop' }]
    })
    const adapter = createOpenAiAdapter({ apiKey: 'k', client })
    await adapter.send({
      system: 'be helpful',
      messages: [{ role: 'user', text: 'add a box' }],
      tools: [{ name: 'addItem', description: 'add', schema: { type: 'object' } }]
    })
    const body = bodies[0] as Record<string, unknown>
    expect(body.tool_choice).toBe('auto')
    expect(body.messages).toEqual([
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'add a box' }
    ])
    expect(body.tools).toEqual([
      { type: 'function', function: { name: 'addItem', description: 'add', parameters: { type: 'object' } } }
    ])
  })

  it('parses tool_calls (JSON-string arguments) into normalized calls', async () => {
    const { client } = fakeClient({
      choices: [{
        message: {
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'moveSelected', arguments: '{"ids":["a"]}' } }]
        },
        finish_reason: 'tool_calls'
      }]
    })
    const adapter = createOpenAiAdapter({ apiKey: 'k', client })
    const res = await adapter.send({ system: '', messages: [{ role: 'user', text: 'go' }], tools: [] })
    expect(res.text).toBe('')
    expect(res.stopReason).toBe('tool_use')
    expect(res.toolCalls).toEqual([{ id: 'call_1', name: 'moveSelected', args: { ids: ['a'] } }])
  })

  it('encodes an assistant tool-call turn and a tool-result turn', async () => {
    const { client, bodies } = fakeClient({
      choices: [{ message: { content: 'done', tool_calls: [] }, finish_reason: 'stop' }]
    })
    const adapter = createOpenAiAdapter({ apiKey: 'k', client })
    await adapter.send({
      system: '',
      messages: [
        { role: 'user', text: 'go' },
        { role: 'assistant', text: 'calling', toolCalls: [{ id: 'call_1', name: 'addItem', args: { a: 1 } }] },
        { role: 'tool', text: '{"ok":true}', toolCallId: 'call_1' }
      ],
      tools: []
    })
    const body = bodies[0] as { messages: unknown[] }
    expect(body.messages).toEqual([
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: 'calling',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'addItem', arguments: '{"a":1}' } }]
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' }
    ])
  })

  it('encodes an assistant turn without text or tool calls as null content', async () => {
    const { client, bodies } = fakeClient({
      choices: [{ message: { content: 'done', tool_calls: [] }, finish_reason: 'stop' }]
    })
    const adapter = createOpenAiAdapter({ apiKey: 'k', client })
    await adapter.send({ system: '', messages: [{ role: 'assistant', text: '' }], tools: [] })
    const body = bodies[0] as { messages: unknown[] }
    expect(body.messages).toEqual([{ role: 'assistant', content: null }])
  })

  it('maps an empty choices response to an empty "other" result', async () => {
    const { client } = fakeClient({ choices: [] })
    const adapter = createOpenAiAdapter({ apiKey: 'k', client })
    const res = await adapter.send({ system: '', messages: [{ role: 'user', text: 'go' }], tools: [] })
    expect(res).toEqual({ text: '', toolCalls: [], stopReason: 'other' })
  })
})
