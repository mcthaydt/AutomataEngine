import { resolve } from 'node:path'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { RESOURCE_URIS, getWorkspacePrompt, parseUnifiedToolArgs, workspacePromptDefs } from '@automata/contracts'
import { createSessionHost } from './sessionHost'
import { createMcpServer } from './server'

const USAGE = `Usage: automata-editor-mcp --workspace <repoRoot>

The single-mode workspace server: list and scaffold games, open projects,
author content with write-through persistence, and run hash-guarded checks.
`
function parseArgs(args: readonly string[]): { help: boolean; workspaceDir?: string } {
  const options: { help: boolean; workspaceDir?: string } = { help: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') { options.help = true; continue }
    if (arg === '--workspace') { const value = args[++index]; if (!value) throw new Error('--workspace requires a value'); options.workspaceDir = value; continue }
    if (arg === '--project' || arg === '--bundle') throw new Error(`${arg} was removed; use --workspace and the openProject tool`)
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}
async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args)
  if (options.help || !options.workspaceDir) { process.stderr.write(USAGE); return }
  const repoRoot = resolve(options.workspaceDir)
  const server = createMcpServer(createSessionHost({ repoRoot }), { parseArgs: parseUnifiedToolArgs, resourceUris: Object.values(RESOURCE_URIS), prompts: { list: workspacePromptDefs, get: getWorkspacePrompt } })
  await server.connect(new StdioServerTransport())
  process.stderr.write(`automata-editor MCP ready: workspace mode (${repoRoot})\n`)
}
void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 })
