import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import type { ToolHost } from '@automata/contracts'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createMcpServer } from '../src/server'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const fakeHost: ToolHost = {
  listTools: () => [],
  executeTool: async () => ({ ok: true, content: null }),
  readResource: async () => null
}

describe('MCP server', () => {
  it('reads a valid editor resource through the in-memory server', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const host: ToolHost = {
      ...fakeHost,
      readResource: async (uri) => ({ uri, title: 'Current document' })
    }
    const server = createMcpServer(host)
    const client = new Client({ name: 'editor-mcp-server-test', version: '0.0.0' })

    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      const result = await client.readResource({ uri: 'editor://doc' })
      const content = result.contents[0]!
      expect(content).toMatchObject({ uri: 'editor://doc', mimeType: 'application/json' })
      expect(JSON.parse((content as { text: string }).text)).toEqual({
        uri: 'editor://doc',
        title: 'Current document'
      })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('rejects an unknown resource URI as invalid params', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const server = createMcpServer(fakeHost)
    const client = new Client({ name: 'editor-mcp-server-test', version: '0.0.0' })

    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      await expect(client.readResource({ uri: 'editor://missing' })).rejects.toMatchObject({
        code: ErrorCode.InvalidParams
      })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('starts through the declared package executable', async () => {
    const manifest = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8')) as {
      bin: Record<string, string>
    }
    const command = resolve(packageDir, manifest.bin['automata-editor-mcp']!)
    const transport = new StdioClientTransport({ command, cwd: packageDir, stderr: 'pipe' })
    const client = new Client({ name: 'editor-mcp-bin-test', version: '0.0.0' })

    await client.connect(transport)
    try {
      expect((await client.listTools()).tools).toHaveLength(10)
    } finally {
      await client.close()
    }
  })
})
