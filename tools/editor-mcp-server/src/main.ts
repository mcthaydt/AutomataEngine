import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createHeadlessHost } from './headlessHost'
import { createMcpServer } from './server'

async function main(): Promise<void> {
  const levelJson = process.env.AUTOMATA_LEVEL_JSON
  const { host } = await createHeadlessHost({ levelJson })
  const server = createMcpServer(host)
  await server.connect(new StdioServerTransport())
  // stdio transport keeps the process alive; do not write to stdout (it is the MCP channel).
  process.stderr.write('automata-editor MCP server ready\n')
}

void main()
