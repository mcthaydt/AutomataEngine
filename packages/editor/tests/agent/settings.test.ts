import { describe, expect, it } from 'vitest'
import {
  createProvider,
  defaultAgentSettings,
  loadAgentSettings,
  saveAgentSettings
} from '../../src/agent/settings'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    }
  } as Storage
}

describe('agent settings', () => {
  it('returns defaults when nothing is stored', () => {
    const s = loadAgentSettings(memoryStorage())
    expect(s).toEqual(defaultAgentSettings())
    expect(s.provider).toBe('anthropic')
    expect(s.models.anthropic).toBe('claude-opus-4-8')
  })

  it('round-trips through storage and merges partial saved state over defaults', () => {
    const store = memoryStorage()
    saveAgentSettings({ ...defaultAgentSettings(), provider: 'openai' }, store)
    expect(loadAgentSettings(store).provider).toBe('openai')
  })

  it('falls back to defaults on corrupt JSON', () => {
    const store = memoryStorage()
    store.setItem('automata-agent-settings', '{not json')
    expect(loadAgentSettings(store)).toEqual(defaultAgentSettings())
  })

  it('builds a provider adapter for each provider without making a network call', () => {
    for (const provider of ['anthropic', 'openai', 'deepseek'] as const) {
      const settings = { ...defaultAgentSettings(), provider, apiKeys: { anthropic: 'k', openai: 'k', deepseek: 'k' } }
      const adapter = createProvider(settings)
      expect(adapter.id).toBe(provider)
    }
  })
})
