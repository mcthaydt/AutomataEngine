import {
  PROJECT_RESOURCE_URIS,
  projectToolDefs,
  type ProjectToolHost
} from '@automata/contracts'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it, vi } from 'vitest'
import {
  callToolResult,
  listResourcesResult,
  listToolsResult,
  readResourceResult
} from '../src/mcpAdapter'

const fakeHost: ProjectToolHost = {
  listTools: projectToolDefs,
  executeTool: async (name) => ({ ok: true, content: { tool: name } }),
  readResource: async (uri) => ({ uri })
}

const expectedTools = [
  'addEntity', 'removeEntities', 'reparentEntity', 'addComponent', 'removeComponent',
  'addResource', 'removeResource', 'setProperty', 'insertArrayItem', 'removeArrayItem',
  'moveArrayItem', 'getProject', 'getHierarchy', 'getResources', 'validate', 'evaluate'
]

describe('MCP project adapter', () => {
  it('maps every project tool definition and its JSON schema', () => {
    const tools = listToolsResult(fakeHost).tools
    expect(tools.map((tool) => tool.name)).toEqual(expectedTools)
    expect(tools.every((tool) => tool.inputSchema !== undefined)).toBe(true)
  })

  it('wraps project tool results as MCP text and error state', async () => {
    const ok = await callToolResult(fakeHost, 'getProject', {})
    expect(ok).toEqual({
      content: [{ type: 'text', text: JSON.stringify({ tool: 'getProject' }) }],
      isError: false
    })

    const erroring: ProjectToolHost = {
      ...fakeHost,
      executeTool: async () => ({ ok: false, isError: true, content: 'write failed' })
    }
    expect(await callToolResult(erroring, 'addEntity', {
      sceneId: 'arena', entity: { id: 'x', name: 'X', enabled: true, components: [] }
    })).toMatchObject({ isError: true })
  })

  it('maps invalid tool names and arguments to InvalidParams before host execution', async () => {
    const executeTool = vi.fn(fakeHost.executeTool)
    const host: ProjectToolHost = { ...fakeHost, executeTool }

    await expect(callToolResult(host, 'removeArrayItem', {
      target: { kind: 'manifest' }, pointer: 'not-a-pointer', index: -1
    })).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
    await expect(callToolResult(host, 'missingTool', {}))
      .rejects.toMatchObject({ code: ErrorCode.InvalidParams })
    expect(executeTool).not.toHaveBeenCalled()
  })

  it('defaults omitted arguments to an empty object', async () => {
    const executeTool = vi.fn(fakeHost.executeTool)
    await callToolResult({ ...fakeHost, executeTool }, 'getProject', undefined)
    expect(executeTool).toHaveBeenCalledWith('getProject', {})
  })

  it('lists and reads all generic project resources', async () => {
    expect(listResourcesResult().resources.map((resource) => resource.uri)).toEqual(
      Object.values(PROJECT_RESOURCE_URIS)
    )
    for (const uri of Object.values(PROJECT_RESOURCE_URIS)) {
      const result = await readResourceResult(fakeHost, uri)
      expect(JSON.parse(result.contents[0]!.text)).toEqual({ uri })
    }
  })
})
