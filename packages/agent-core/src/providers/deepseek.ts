import { createOpenAiAdapter, type OpenAiChatClient } from './openai'
import type { ProviderAdapter } from './provider'

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'

export interface DeepSeekAdapterOptions {
  apiKey: string
  model?: string
  client?: OpenAiChatClient
}

/** DeepSeek is OpenAI-wire-compatible: the OpenAI adapter pointed at DeepSeek's base URL. */
export function createDeepSeekAdapter(opts: DeepSeekAdapterOptions): ProviderAdapter {
  return createOpenAiAdapter({
    apiKey: opts.apiKey,
    model: opts.model ?? DEFAULT_DEEPSEEK_MODEL,
    baseURL: DEEPSEEK_BASE_URL,
    id: 'deepseek',
    client: opts.client
  })
}
