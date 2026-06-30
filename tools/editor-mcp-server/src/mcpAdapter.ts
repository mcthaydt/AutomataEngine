import {
  RESOURCE_URIS,
  parseToolArgs,
  type ResourceUri,
  type ToolHost,
  type ToolName
} from '@automata/contracts'
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

export function listToolsResult(host: ToolHost): McpToolsResult {
  return {
    tools: host.listTools().map((definition) => ({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.schema
    }))
  }
}

export async function callToolResult(
  host: ToolHost,
  name: string,
  args: unknown
): Promise<McpCallResult> {
  const input = args ?? {}
  try {
    parseToolArgs(name as ToolName, input)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for ${name}: ${message}`)
  }

  const result = await host.executeTool(name as ToolName, input)
  return {
    content: [{ type: 'text', text: JSON.stringify(result.content) }],
    isError: !result.ok || result.isError === true
  }
}

export function listResourcesResult(): McpResourcesResult {
  return {
    resources: Object.values(RESOURCE_URIS).map((uri) => ({
      uri,
      name: uri,
      mimeType: 'application/json'
    }))
  }
}

export function isProjectResourceUri(uri: string): uri is ResourceUri {
  return Object.values(RESOURCE_URIS).some((candidate) => candidate === uri)
}

export async function readResourceResult(
  host: ToolHost,
  uri: ResourceUri
): Promise<McpReadResult> {
  const content = await host.readResource(uri)
  return {
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(content) }]
  }
}
