import { describe, expect, it } from 'vitest'
import type { ToolHost } from '@automata/contracts'
import { callToolResult, listResourcesResult, listToolsResult, readResourceResult } from '../src/mcpAdapter'

const fakeHost: ToolHost = {
  listTools: () => [{ name: 'getDoc', description: 'read the doc', schema: { type: 'object' } }],
  executeTool: async (name) => ({ ok: true, content: { tool: name } }),
  readResource: async (uri) => ({ uri })
}

describe('mcp adapter', () => {
  it('maps tool defs to MCP { name, description, inputSchema }', () => {
    expect(listToolsResult(fakeHost)).toEqual({
      tools: [{ name: 'getDoc', description: 'read the doc', inputSchema: { type: 'object' } }]
    })
  })

  it('wraps a tool result as MCP text content with isError', async () => {
    const ok = await callToolResult(fakeHost, 'getDoc', {})
    expect(ok.content[0]).toEqual({ type: 'text', text: JSON.stringify({ tool: 'getDoc' }) })
    expect(ok.isError).toBe(false)
  })

  it('reports isError true when the host result is an error', async () => {
    const erroring: ToolHost = { ...fakeHost, executeTool: async () => ({ ok: false, isError: true, content: 'bad' }) }
    expect((await callToolResult(erroring, 'addItem', {})).isError).toBe(true)
  })

  it('reports isError true when ok is false without an explicit error flag', async () => {
    const erroring: ToolHost = { ...fakeHost, executeTool: async () => ({ ok: false, content: 'bad' }) }
    expect((await callToolResult(erroring, 'addItem', {})).isError).toBe(true)
  })

  it('lists the editor resource uris', () => {
    expect(listResourcesResult().resources.map((r) => r.uri)).toContain('editor://doc')
  })

  it('reads a resource as JSON text', async () => {
    const res = await readResourceResult(fakeHost, 'editor://doc')
    expect(JSON.parse(res.contents[0]!.text)).toEqual({ uri: 'editor://doc' })
  })
})
