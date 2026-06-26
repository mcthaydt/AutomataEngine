import { RESOURCE_URIS, type ResourceUri, type ToolHost, type ToolName } from '@automata/contracts'

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
    tools: host.listTools().map((d) => ({ name: d.name, description: d.description, inputSchema: d.schema }))
  }
}

export async function callToolResult(host: ToolHost, name: string, args: unknown): Promise<McpCallResult> {
  const result = await host.executeTool(name as ToolName, args ?? {})
  return {
    content: [{ type: 'text', text: JSON.stringify(result.content) }],
    isError: result.isError === true
  }
}

export function listResourcesResult(): McpResourcesResult {
  return {
    resources: Object.values(RESOURCE_URIS).map((uri) => ({ uri, name: uri, mimeType: 'application/json' }))
  }
}

export async function readResourceResult(host: ToolHost, uri: string): Promise<McpReadResult> {
  const content = await host.readResource(uri as ResourceUri)
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(content) }] }
}
