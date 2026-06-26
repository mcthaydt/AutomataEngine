import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import type { ToolHost } from '@automata/contracts'
import { callToolResult, listResourcesResult, listToolsResult, readResourceResult } from './mcpAdapter'

/** Binds a contracts ToolHost to an MCP Server exposing the registry as tools + resources. */
export function createMcpServer(host: ToolHost): Server {
  const server = new Server(
    { name: 'automata-editor', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => listToolsResult(host))
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    callToolResult(host, req.params.name, req.params.arguments)
  )
  server.setRequestHandler(ListResourcesRequestSchema, async () => listResourcesResult())
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => readResourceResult(host, req.params.uri))

  return server
}
