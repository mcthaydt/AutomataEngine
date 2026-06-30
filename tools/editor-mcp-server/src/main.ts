import { readFile } from 'node:fs/promises'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createHeadlessHost } from './headlessHost'
import { createMcpServer } from './server'

interface CliOptions {
  help: boolean
  projectDir?: string
  bundleFile?: string
}

const USAGE = `Usage: automata-editor-mcp [--project <directory> | --bundle <file>]

Options:
  --project <directory>  Open a project workspace directory
  --bundle <file>        Open a portable project bundle JSON file
  --help                 Show this help
`

function parseArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = { help: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--project' || arg === '--bundle') {
      const value = args[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      if (arg === '--project') options.projectDir = value
      else options.bundleFile = value
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (options.projectDir && options.bundleFile) {
    throw new Error('--project and --bundle cannot be used together')
  }
  return options
}

async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args)
  if (options.help) {
    process.stderr.write(USAGE)
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
  // Stdout is exclusively the MCP channel; status is deliberately stderr-only.
  process.stderr.write(
    `automata-editor MCP ready: ${opened.snapshot.manifest.name} (${opened.registration.gameId})\n`
  )
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
