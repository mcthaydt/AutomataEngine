import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getWorkspacePrompt,
  toolDefs,
  workspacePromptDefs,
  type ToolHost
} from '@automata/contracts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it } from 'vitest'
import { createHeadlessHost } from '../src/headlessHost'
import { createMcpServer } from '../src/server'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pulsebreakProject = resolve(packageDir, '../../games/pulsebreak/public/project')

const fakeHost: ToolHost = {
  listTools: toolDefs,
  executeTool: async () => ({ ok: true, content: null }),
  readResource: async (uri) => ({ uri, title: 'Current project' })
}

async function connected(host: ToolHost) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = createMcpServer(host)
  const client = new Client({ name: 'editor-mcp-server-test', version: '0.0.0' })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return { client, server }
}

describe('MCP server', () => {
  it('reads generic project resources through the protocol', async () => {
    const { client, server } = await connected(fakeHost)
    try {
      const result = await client.readResource({ uri: 'editor://project' })
      const content = result.contents[0]!
      expect(content).toMatchObject({ uri: 'editor://project', mimeType: 'application/json' })
      expect(JSON.parse((content as { text: string }).text)).toEqual({
        uri: 'editor://project', title: 'Current project'
      })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('maps invalid tool arguments and unknown resources to InvalidParams', async () => {
    const { client, server } = await connected(fakeHost)
    try {
      await expect(client.callTool({
        name: 'removeArrayItem',
        arguments: { target: { kind: 'manifest' }, pointer: 'bad', index: -1 }
      })).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
      await expect(client.readResource({ uri: 'editor://missing' })).rejects.toMatchObject({
        code: ErrorCode.InvalidParams
      })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('returns write errors without mutating the project sandbox', async () => {
    const { host } = await createHeadlessHost({ projectDir: pulsebreakProject })
    const before = host.snapshot
    const { client, server } = await connected(host)
    try {
      const result = await client.callTool({
        name: 'addResource',
        arguments: {
          path: 'resources/duplicate.resource.json',
          resource: {
            formatVersion: 1,
            id: 'waves',
            typeId: 'pulsebreak.wave-set',
            data: { waves: [] }
          }
        }
      })
      expect(result.isError).toBe(true)
      expect(host.snapshot).toBe(before)
      expect(host.commands).toHaveLength(0)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('serves workspace prompts when configured', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const server = createMcpServer(fakeHost, {
      resourceUris: [],
      prompts: { list: workspacePromptDefs, get: getWorkspacePrompt }
    })
    const client = new Client({ name: 'prompt-test', version: '0.0.0' })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      expect((await client.listPrompts()).prompts).toEqual([
        expect.objectContaining({ name: 'build-game' })
      ])
      const prompt = await client.getPrompt({
        name: 'build-game',
        arguments: { description: 'a chill fishing game' }
      })
      const text = (prompt.messages[0]!.content as { text: string }).text
      expect(text).toContain('a chill fishing game')
      expect(text).toContain('createGame')
      await expect(client.getPrompt({ name: 'build-game', arguments: {} }))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('maps non-Error prompt failures to InvalidParams', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const server = createMcpServer(fakeHost, {
      resourceUris: [],
      prompts: {
        list: workspacePromptDefs,
        get: () => { throw 'string failure' }
      }
    })
    const client = new Client({ name: 'prompt-throw-test', version: '0.0.0' })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      await expect(client.getPrompt({ name: 'build-game', arguments: { description: 'x' } }))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams, message: expect.stringContaining('string failure') })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('decorates project tool descriptions with per-type JSON schemas', async () => {
    const { host } = await createHeadlessHost({ projectDir: pulsebreakProject })
    const { client, server } = await connected(host)
    try {
      const tools = (await client.listTools()).tools
      const addComponent = tools.find((tool) => tool.name === 'addComponent')!
      expect(addComponent.description).toContain('pulsebreak.spawn-zone')
      expect(addComponent.description).toContain('core.transform')
      const addResource = tools.find((tool) => tool.name === 'addResource')!
      expect(addResource.description).toContain('pulsebreak.tuning')
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('stdio smoke starts through the declared executable', async () => {
    const manifest = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8')) as {
      bin: Record<string, string>
    }
    const command = resolve(packageDir, manifest.bin['automata-editor-mcp']!)
    const transport = new StdioClientTransport({ command, cwd: packageDir, stderr: 'pipe' })
    const client = new Client({ name: 'editor-mcp-bin-test', version: '0.0.0' })

    await client.connect(transport)
    try {
      expect((await client.listTools()).tools).toHaveLength(16)
    } finally {
      await client.close()
    }
  })
})
