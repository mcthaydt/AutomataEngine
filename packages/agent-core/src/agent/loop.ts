import type { ToolHost, ToolName, ToolResult } from '@automata/contracts'
import type { AgentMessage, ProviderAdapter } from '../providers/provider'

export interface AgentRunOptions {
  provider: ProviderAdapter
  host: ToolHost
  system: string
  prompt: string
  model?: string
  /** Hard cap on model round-trips. Default 8. */
  maxTurns?: number
}

/** A tool call the loop actually ran, kept so the host can preview the batch. */
export interface ExecutedToolCall {
  name: string
  args: unknown
  result: ToolResult
}

export interface AgentRunResult {
  finalText: string
  messages: AgentMessage[]
  executed: ExecutedToolCall[]
  stoppedBy: 'end' | 'max-turns'
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const maxTurns = opts.maxTurns ?? 8
  const tools = opts.host.listTools()
  const known = new Set<string>(tools.map((t) => t.name))
  const messages: AgentMessage[] = [{ role: 'user', text: opts.prompt }]
  const executed: ExecutedToolCall[] = []

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await opts.provider.send({ system: opts.system, messages, tools, model: opts.model })
    messages.push({
      role: 'assistant',
      text: response.text,
      toolCalls: response.toolCalls,
      providerMetadata: response.providerMetadata
    })

    if (response.toolCalls.length === 0) {
      return { finalText: response.text, messages, executed, stoppedBy: 'end' }
    }

    for (const call of response.toolCalls) {
      const result: ToolResult = known.has(call.name)
        ? await opts.host.executeTool(call.name as ToolName, call.args)
        : { ok: false, isError: true, content: `Unknown tool: ${call.name}` }
      executed.push({ name: call.name, args: call.args, result })
      messages.push({ role: 'tool', text: JSON.stringify(result), toolCallId: call.id, toolResult: result })
    }
  }

  const last = messages.filter((m) => m.role === 'assistant').at(-1)
  return { finalText: last?.text ?? '', messages, executed, stoppedBy: 'max-turns' }
}
