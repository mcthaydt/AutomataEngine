import { describe, it, expect } from 'vitest'
import { runAgent } from '../../src/agent/loop'
import type { ProviderAdapter, ProviderResponse } from '../../src/providers/provider'
import type { ToolDef, ToolHost, ToolResult } from '@automata/contracts'

const TOOLS: ToolDef[] = [{ name: 'addItem', description: 'add', schema: {} }]

function fakeHost(): { host: ToolHost; calls: { name: string; args: unknown }[] } {
  const calls: { name: string; args: unknown }[] = []
  const host: ToolHost = {
    listTools: () => TOOLS,
    executeTool: async (name, args) => {
      calls.push({ name, args })
      const result: ToolResult = { ok: true, content: { applied: name } }
      return result
    },
    readResource: async () => ({})
  }
  return { host, calls }
}

/** Returns a scripted sequence of provider responses, one per send() call. */
function scriptedProvider(responses: ProviderResponse[]): ProviderAdapter {
  let i = 0
  return {
    id: 'anthropic',
    defaultModel: 'm',
    send: async () => responses[i++] ?? { text: '', toolCalls: [], stopReason: 'end' }
  }
}

describe('runAgent', () => {
  it('executes a tool call then stops when the model ends the turn', async () => {
    const { host, calls } = fakeHost()
    const provider = scriptedProvider([
      { text: 'placing', toolCalls: [{ id: 't1', name: 'addItem', args: { x: 1 } }], stopReason: 'tool_use' },
      { text: 'all set', toolCalls: [], stopReason: 'end' }
    ])
    const result = await runAgent({ provider, host, system: 's', prompt: 'add a box' })
    expect(calls).toEqual([{ name: 'addItem', args: { x: 1 } }])
    expect(result.finalText).toBe('all set')
    expect(result.stoppedBy).toBe('end')
    expect(result.executed).toEqual([{ name: 'addItem', args: { x: 1 }, result: { ok: true, content: { applied: 'addItem' } } }])
  })

  it('stops at maxTurns when the model keeps calling tools', async () => {
    const { host } = fakeHost()
    const loop: ProviderResponse = { text: '', toolCalls: [{ id: 't', name: 'addItem', args: {} }], stopReason: 'tool_use' }
    const provider = scriptedProvider([loop, loop, loop, loop, loop])
    const result = await runAgent({ provider, host, system: 's', prompt: 'go', maxTurns: 2 })
    expect(result.stoppedBy).toBe('max-turns')
    expect(result.executed).toHaveLength(2)
  })

  it('returns empty final text when maxTurns is zero before the provider is called', async () => {
    const { host } = fakeHost()
    const provider = scriptedProvider([{ text: 'unused', toolCalls: [], stopReason: 'end' }])
    const result = await runAgent({ provider, host, system: 's', prompt: 'go', maxTurns: 0 })
    expect(result).toMatchObject({ finalText: '', stoppedBy: 'max-turns', executed: [] })
  })

  it('returns an error tool result for an unknown tool name without throwing', async () => {
    const { host } = fakeHost()
    const provider = scriptedProvider([
      { text: '', toolCalls: [{ id: 't', name: 'noSuchTool', args: {} }], stopReason: 'tool_use' },
      { text: 'recovered', toolCalls: [], stopReason: 'end' }
    ])
    const result = await runAgent({ provider, host, system: 's', prompt: 'go' })
    expect(result.finalText).toBe('recovered')
    expect(result.executed[0]?.result.isError).toBe(true)
  })
})
