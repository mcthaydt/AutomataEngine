import Anthropic from '@anthropic-ai/sdk'
import type { AgentMessage, NormalizedToolCall, ProviderAdapter, ProviderResponse } from './provider'

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-8'

/** The slice of the Anthropic SDK the adapter uses; injectable so tests run offline. */
export interface AnthropicMessagesClient {
  messages: { create(body: Record<string, unknown>): Promise<AnthropicResponse> }
}

interface AnthropicBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
}
interface AnthropicResponse {
  content: AnthropicBlock[]
  stop_reason: string
}

export interface AnthropicAdapterOptions {
  apiKey: string
  model?: string
  /** Injected client for tests; defaults to a browser-enabled Anthropic client. */
  client?: AnthropicMessagesClient
}

function toAnthropicMessages(messages: AgentMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.text }] }
    }
    if (m.role === 'assistant') {
      const content: unknown[] = []
      if (m.text) content.push({ type: 'text', text: m.text })
      for (const call of m.toolCalls ?? []) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args })
      }
      return { role: 'assistant', content }
    }
    return { role: 'user', content: [{ type: 'text', text: m.text }] }
  })
}

export function createAnthropicAdapter(opts: AnthropicAdapterOptions): ProviderAdapter {
  const model = opts.model ?? DEFAULT_ANTHROPIC_MODEL
  const client: AnthropicMessagesClient =
    opts.client ??
    (new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true }) as unknown as AnthropicMessagesClient)

  return {
    id: 'anthropic',
    defaultModel: model,
    async send(req): Promise<ProviderResponse> {
      const response = await client.messages.create({
        model: req.model ?? model,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system: req.system,
        messages: toAnthropicMessages(req.messages),
        tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }))
      })

      const text = response.content
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('')
      const toolCalls: NormalizedToolCall[] = response.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id ?? '', name: b.name ?? '', args: b.input }))
      const stopReason: ProviderResponse['stopReason'] =
        response.stop_reason === 'tool_use' ? 'tool_use' : response.stop_reason === 'end_turn' ? 'end' : 'other'

      return { text, toolCalls, stopReason }
    }
  }
}
