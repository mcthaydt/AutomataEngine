import OpenAI from 'openai'
import type { AgentMessage, NormalizedToolCall, ProviderAdapter, ProviderId, ProviderResponse } from './provider'

export const DEFAULT_OPENAI_MODEL = 'gpt-5'

/** The slice of the OpenAI SDK the adapter uses; injectable so tests run offline. */
export interface OpenAiChatClient {
  chat: { completions: { create(body: Record<string, unknown>): Promise<OpenAiResponse> } }
}

interface OpenAiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}
interface OpenAiResponse {
  choices: { message: { content: string | null; tool_calls?: OpenAiToolCall[] }; finish_reason: string }[]
}

export interface OpenAiAdapterOptions {
  apiKey: string
  model?: string
  baseURL?: string
  /** Provider id this adapter reports; DeepSeek reuses the wire shape under id 'deepseek'. */
  id?: ProviderId
  /** Injected client for tests; defaults to a browser-enabled OpenAI client. */
  client?: OpenAiChatClient
}

function toOpenAiMessages(system: string, messages: AgentMessage[]): unknown[] {
  const out: unknown[] = []
  if (system) out.push({ role: 'system', content: system })
  for (const m of messages) {
    if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.text })
    } else if (m.role === 'assistant') {
      const turn: Record<string, unknown> = { role: 'assistant', content: m.text || null }
      if (m.toolCalls?.length) {
        turn.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args) }
        }))
      }
      out.push(turn)
    } else {
      out.push({ role: 'user', content: m.text })
    }
  }
  return out
}

export function createOpenAiAdapter(opts: OpenAiAdapterOptions): ProviderAdapter {
  const model = opts.model ?? DEFAULT_OPENAI_MODEL
  const client: OpenAiChatClient =
    opts.client ??
    (new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      dangerouslyAllowBrowser: true
    }) as unknown as OpenAiChatClient)

  return {
    id: opts.id ?? 'openai',
    defaultModel: model,
    async send(req): Promise<ProviderResponse> {
      const response = await client.chat.completions.create({
        model: req.model ?? model,
        messages: toOpenAiMessages(req.system, req.messages),
        tools: req.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.schema }
        })),
        tool_choice: 'auto'
      })

      const choice = response.choices[0]
      const text = choice?.message.content ?? ''
      const toolCalls: NormalizedToolCall[] = (choice?.message.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function.name,
        args: JSON.parse(c.function.arguments)
      }))
      const stopReason: ProviderResponse['stopReason'] =
        choice?.finish_reason === 'tool_calls' ? 'tool_use' : choice?.finish_reason === 'stop' ? 'end' : 'other'

      return { text, toolCalls, stopReason }
    }
  }
}
