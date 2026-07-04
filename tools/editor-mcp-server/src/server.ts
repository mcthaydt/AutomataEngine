import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import {
  RESOURCE_URIS, parseToolArgs,
  type McpToolHost, type ParseToolArgs, type PromptDef, type PromptResult
} from '@automata/contracts'
import {
  callToolResult,
  listResourcesResult,
  listToolsResult,
  readResourceResult
} from './mcpAdapter'

export interface McpServerOptions {
  /** Protocol-level argument validation; defaults to the project tool schemas. */
  parseArgs?: ParseToolArgs
  /** Resources the host serves; defaults to the project resource URIs. */
  resourceUris?: readonly string[]
  /** Optional prompt surface (workspace mode registers build-game). */
  prompts?: {
    list(): PromptDef[]
    get(name: string, args: unknown): PromptResult
  }
}

/** Bind one isolated host (project or workspace) to the MCP tools/resources protocol. */
export function createMcpServer(host: McpToolHost, options: McpServerOptions = {}): Server {
  const parseArgs = options.parseArgs ?? parseToolArgs
  const resourceUris = options.resourceUris ?? Object.values(RESOURCE_URIS)
  const server = new Server(
    { name: 'automata-editor', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {}, ...(options.prompts ? { prompts: {} } : {}) } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => listToolsResult(host))
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    callToolResult(host, req.params.name, req.params.arguments, parseArgs)
  )
  server.setRequestHandler(ListResourcesRequestSchema, async () => listResourcesResult(resourceUris))
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const { uri } = req.params
    if (!resourceUris.includes(uri)) {
      throw new McpError(ErrorCode.InvalidParams, `Resource ${uri} not found`)
    }
    return readResourceResult(host, uri)
  })

  const { prompts } = options
  if (prompts) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: prompts.list() }))
    server.setRequestHandler(GetPromptRequestSchema, async (req) => {
      try {
        return prompts.get(req.params.name, req.params.arguments ?? {})
      } catch (error) {
        throw new McpError(ErrorCode.InvalidParams, error instanceof Error ? error.message : String(error))
      }
    })
  }

  return server
}
