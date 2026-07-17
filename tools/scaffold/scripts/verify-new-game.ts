import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The paved-road acceptance proof, run against a clean local clone so nothing
 * leaks into the working tree: scaffold a game, install, run the full CI gate
 * with the new game included, build it, assert the MCP server loads it, and
 * drive its generated Playwright smoke. Run this whenever scaffold templates
 * or the engine/project APIs they target change.
 */

const GAME = 'probe-game'

interface RunOptions {
  cwd: string
  env?: Record<string, string>
}

function run(command: string, args: string[], options: RunOptions): Promise<void> {
  process.stderr.write(`\n>> ${command} ${args.join(' ')}\n`)
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
  })
}

function assertMcpServerOpensProject(cwd: string): Promise<void> {
  process.stderr.write(`\n>> MCP workspace server: openProject ${GAME}\n`)
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      'npx',
      ['tsx', 'tools/editor-mcp-server/src/main.ts', '--workspace', '.'],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`MCP openProject timed out. stderr:\n${stderr}`))
    }, 120_000)
    let buffer = ''
    const send = (message: object): void => { child.stdin.write(`${JSON.stringify(message)}\n`) }
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); newline = buffer.indexOf('\n')
        if (!line.trim()) continue
        const message = JSON.parse(line) as { id?: number; error?: unknown; result?: { isError?: boolean; content?: Array<{ text?: string }> } }
        if (message.id === 1) { send({ jsonrpc: '2.0', method: 'notifications/initialized' }); send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'openProject', arguments: { gameId: GAME } } }) }
        if (message.id === 2) { clearTimeout(timer); child.kill(); if (message.error || message.result?.isError) reject(new Error(`openProject failed: ${JSON.stringify(message)}`)); else if (!message.result?.content?.[0]?.text?.includes(`"opened":"${GAME}"`)) reject(new Error(`unexpected openProject result: ${JSON.stringify(message.result)}`)); else resolvePromise() }
      }
    })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify-new-game', version: '0' } } })
  })
}

const repoRoot = process.cwd()
const clone = await mkdtemp(join(tmpdir(), 'automata-verify-'))
try {
  await run('git', ['clone', '--local', '--no-hardlinks', repoRoot, clone], { cwd: repoRoot })
  await run('node', ['tools/scaffold/src/main.ts', GAME], { cwd: clone })
  await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: clone })
  await run('npm', ['run', 'ci'], { cwd: clone })
  await run('npm', ['run', 'build', '-w', GAME], { cwd: clone })
  await assertMcpServerOpensProject(clone)
  await run('npx', ['playwright', 'test', `games/${GAME}/e2e`], {
    cwd: clone,
    env: { PLAYWRIGHT_ONLY: GAME }
  })
  process.stderr.write('\nverify:new-game OK\n')
} finally {
  await rm(clone, { recursive: true, force: true })
}
