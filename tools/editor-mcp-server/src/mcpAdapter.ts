import { RESOURCE_URIS, type McpToolHost, type ParseToolArgs, type ResourceUri } from '@automata/contracts'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'

export type McpToolsResult = {
  tools: { name: string; description: string; inputSchema: unknown }[]
}
export type McpCallResult = {
  content: { type: 'text'; text: string }[]
  isError: boolean
}
export type McpResourcesResult = {
  resources: { uri: string; name: string; mimeType: string }[]
}
export type McpReadResult = {
  contents: { uri: string; mimeType: string; text: string }[]
}

export function listToolsResult(host: McpToolHost): McpToolsResult {
  return {
    tools: host.listTools().map((definition) => ({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.schema
    }))
  }
}

export async function callToolResult(
  host: McpToolHost,
  name: string,
  args: unknown,
  parseArgs: ParseToolArgs
): Promise<McpCallResult> {
  const input = args ?? {}
  try {
    parseArgs(name, input)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for ${name}: ${message}`)
  }

  const result = await host.executeTool(name, input)
  return {
    content: [{ type: 'text', text: JSON.stringify(result.content) }],
    isError: !result.ok || result.isError === true
  }
}

export function listResourcesResult(uris: readonly string[]): McpResourcesResult {
  return {
    resources: uris.map((uri) => ({ uri, name: uri, mimeType: 'application/json' }))
  }
}

export function isProjectResourceUri(uri: string): uri is ResourceUri {
  return Object.values(RESOURCE_URIS).some((candidate) => candidate === uri)
}

export async function readResourceResult(
  host: McpToolHost,
  uri: string
): Promise<McpReadResult> {
  const content = await host.readResource(uri)
  return {
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(content) }]
  }
}
