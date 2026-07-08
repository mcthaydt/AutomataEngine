import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  getWorkspacePrompt,
  parseSessionToolArgs,
  parseToolArgs,
  parseWorkspaceToolArgs,
  sessionToolDefs,
  workspacePromptDefs
} from '@automata/contracts'
import { createHeadlessHost } from './headlessHost'
import { createMcpServer } from './server'

const SESSION_TOOL_NAMES = new Set(sessionToolDefs().map((def) => def.name))

/** Validate arguments for every tool family the durable session serves. */
function parseSessionAndWorkspaceArgs(name: string, args: unknown): unknown {
  if (name === 'createGame' || name === 'listGames') return parseWorkspaceToolArgs(name, args)
  if (SESSION_TOOL_NAMES.has(name)) return parseSessionToolArgs(name, args)
  return parseToolArgs(name, args) // project authoring tools
}

interface CliOptions {
  help: boolean
  projectDir?: string
  bundleFile?: string
  workspaceDir?: string
}

const USAGE = `Usage: automata-editor-mcp [--project <directory> | --bundle <file> | --workspace <repoRoot>]

Options:
  --project <directory>   Open a project workspace directory
  --bundle <file>         Open a portable project bundle JSON file
  --workspace <repoRoot>  Durable build session: scaffold games, then openProject to author and run
  --help                  Show this help
`

function parseArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = { help: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--project' || arg === '--bundle' || arg === '--workspace') {
      const value = args[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      if (arg === '--project') options.projectDir = value
      else if (arg === '--bundle') options.bundleFile = value
      else options.workspaceDir = value
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  const sources = [options.projectDir, options.bundleFile, options.workspaceDir].filter((value) => value !== undefined)
  if (sources.length > 1) {
    throw new Error('--project, --bundle, and --workspace cannot be used together')
  }
  return options
}

async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args)
  if (options.help) {
    process.stderr.write(USAGE)
    return
  }

  // Stdout is exclusively the MCP channel; status is deliberately stderr-only.
  if (options.workspaceDir !== undefined) {
    const repoRoot = resolve(options.workspaceDir)
    const { nodeExec, playwrightBrowserSmoke } = await import('./session/adapters')
    const { createSessionHost } = await import('./session/sessionHost')
    const host = await createSessionHost({ repoRoot, exec: nodeExec, browserSmoke: playwrightBrowserSmoke })
    const server = createMcpServer(host, {
      parseArgs: parseSessionAndWorkspaceArgs,
      resourceUris: [],
      prompts: { list: workspacePromptDefs, get: getWorkspacePrompt },
      toolsListChanged: true
    })
    host.bindNotifications(() => { void server.sendToolListChanged() })
    await server.connect(new StdioServerTransport())
    process.stderr.write(`automata-editor MCP ready: durable session (${repoRoot})\n`)
    return
  }

  const bundleJson = options.bundleFile
    ? await readFile(options.bundleFile, 'utf8')
    : undefined
  const opened = await createHeadlessHost({
    projectDir: options.projectDir,
    bundleJson
  })
  const server = createMcpServer(opened.host)
  await server.connect(new StdioServerTransport())
  process.stderr.write(
    `automata-editor MCP ready: ${opened.snapshot.manifest.name} (${opened.registration.gameId})\n`
  )
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
