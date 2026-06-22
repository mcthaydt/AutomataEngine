import type { ToolDef } from '@automata/contracts'

export type ProviderId = 'anthropic' | 'openai' | 'deepseek'

/** A tool call requested by the model, normalized across providers. */
export interface NormalizedToolCall {
  /** Provider-assigned id; echoed back when returning the tool result. */
  id: string
  /** Tool name; must match a `ToolDef.name`. */
  name: string
  /** Parsed JSON arguments object. */
  args: unknown
}

/** One turn in the normalized conversation log the loop maintains. */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool'
  text: string
  /** Present on an assistant turn that requested tools. */
  toolCalls?: NormalizedToolCall[]
  /** Present on a `tool` turn: the id of the call this result answers. */
  toolCallId?: string
}

export interface ProviderRequest {
  system: string
  messages: AgentMessage[]
  tools: ToolDef[]
  /** Overrides the adapter's `defaultModel` when set. */
  model?: string
}

export interface ProviderResponse {
  text: string
  toolCalls: NormalizedToolCall[]
  /** `tool_use` = wants tools; `end` = done; `other` = refusal/length/etc. */
  stopReason: 'tool_use' | 'end' | 'other'
}

export interface ProviderAdapter {
  readonly id: ProviderId
  readonly defaultModel: string
  send(req: ProviderRequest): Promise<ProviderResponse>
}
