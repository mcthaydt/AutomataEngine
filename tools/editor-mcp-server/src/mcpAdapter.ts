import {
  PROJECT_RESOURCE_URIS,
  parseProjectToolArgs,
  type ProjectResourceUri,
  type ProjectToolHost,
  type ProjectToolName
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

export function listToolsResult(host: ProjectToolHost): McpToolsResult {
  return {
    tools: host.listTools().map((definition) => ({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.schema
    }))
  }
}

export async function callToolResult(
  host: ProjectToolHost,
  name: string,
  args: unknown
): Promise<McpCallResult> {
  const input = args ?? {}
  try {
    parseProjectToolArgs(name as ProjectToolName, input)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for ${name}: ${message}`)
  }

  const result = await host.executeTool(name as ProjectToolName, input)
  return {
    content: [{ type: 'text', text: JSON.stringify(result.content) }],
    isError: !result.ok || result.isError === true
  }
}

export function listResourcesResult(): McpResourcesResult {
  return {
    resources: Object.values(PROJECT_RESOURCE_URIS).map((uri) => ({
      uri,
      name: uri,
      mimeType: 'application/json'
    }))
  }
}

export function isProjectResourceUri(uri: string): uri is ProjectResourceUri {
  return Object.values(PROJECT_RESOURCE_URIS).some((candidate) => candidate === uri)
}

export async function readResourceResult(
  host: ProjectToolHost,
  uri: ProjectResourceUri
): Promise<McpReadResult> {
  const content = await host.readResource(uri)
  return {
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(content) }]
  }
}
