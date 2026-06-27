import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_OPENAI_MODEL,
  createAnthropicAdapter,
  createDeepSeekAdapter,
  createOpenAiAdapter,
  type ProviderAdapter,
  type ProviderId
} from '@automata/agent-core'

const STORAGE_KEY = 'automata-agent-settings'
const PROVIDERS = ['anthropic', 'openai', 'deepseek'] as const

export interface AgentSettings {
  provider: ProviderId
  /** Per-provider API keys; live only in localStorage, never logged. */
  apiKeys: Record<ProviderId, string>
  /** Per-provider model id; user-overridable. */
  models: Record<ProviderId, string>
}

export function defaultAgentSettings(): AgentSettings {
  return {
    provider: 'anthropic',
    apiKeys: { anthropic: '', openai: '', deepseek: '' },
    models: {
      anthropic: DEFAULT_ANTHROPIC_MODEL,
      openai: DEFAULT_OPENAI_MODEL,
      deepseek: DEFAULT_DEEPSEEK_MODEL
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value)
}

function mergeProviderStrings(
  fallback: Record<ProviderId, string>,
  candidate: unknown
): Record<ProviderId, string> {
  const next = { ...fallback }
  if (!isRecord(candidate)) return next
  for (const provider of PROVIDERS) {
    const value = candidate[provider]
    if (typeof value === 'string') next[provider] = value
  }
  return next
}

export function loadAgentSettings(storage: Storage = localStorage): AgentSettings {
  const fallback = defaultAgentSettings()
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return fallback
    return {
      provider: isProviderId(parsed.provider) ? parsed.provider : fallback.provider,
      apiKeys: mergeProviderStrings(fallback.apiKeys, parsed.apiKeys),
      models: mergeProviderStrings(fallback.models, parsed.models)
    }
  } catch {
    return fallback
  }
}

export function saveAgentSettings(settings: AgentSettings, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

/** Builds a provider adapter from settings. Does no network I/O; keys are used on send(). */
export function createProvider(settings: AgentSettings): ProviderAdapter {
  const apiKey = settings.apiKeys[settings.provider]
  const model = settings.models[settings.provider]
  switch (settings.provider) {
    case 'anthropic':
      return createAnthropicAdapter({ apiKey, model })
    case 'openai':
      return createOpenAiAdapter({ apiKey, model })
    case 'deepseek':
      return createDeepSeekAdapter({ apiKey, model })
  }
}
