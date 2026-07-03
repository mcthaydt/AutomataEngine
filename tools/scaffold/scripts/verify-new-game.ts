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

function assertMcpServerLoads(cwd: string): Promise<void> {
  process.stderr.write(`\n>> MCP server --project games/${GAME}/public/project\n`)
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      'npx',
      ['tsx', 'tools/editor-mcp-server/src/main.ts', '--project', `games/${GAME}/public/project`],
      { cwd, stdio: ['pipe', 'ignore', 'pipe'] }
    )
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`MCP server did not report ready. stderr:\n${stderr}`))
    }, 60_000)
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (/automata-editor MCP ready/.test(stderr)) {
        clearTimeout(timer)
        child.kill()
        process.stderr.write(stderr)
        resolvePromise()
      }
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
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
  await assertMcpServerLoads(clone)
  await run('npx', ['playwright', 'test', `games/${GAME}/e2e`], {
    cwd: clone,
    env: { PLAYWRIGHT_ONLY: GAME }
  })
  process.stderr.write('\nverify:new-game OK\n')
} finally {
  await rm(clone, { recursive: true, force: true })
}
