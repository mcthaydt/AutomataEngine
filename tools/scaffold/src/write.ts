import {
  lstat as nodeLstat,
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  readdir as nodeReaddir,
  rm as nodeRm,
  writeFile as nodeWriteFile
} from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { planNewGame } from './plan.ts'

export interface ScaffoldFs {
  lstat(path: string): Promise<unknown>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>
  readFile(path: string, encoding: 'utf8'): Promise<string>
  readdir(path: string): Promise<string[]>
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>
  writeFile(path: string, data: string, options?: { flag?: string }): Promise<void>
}

const nodeFs: ScaffoldFs = {
  async lstat(path) { await nodeLstat(path) },
  async mkdir(path, options) { await nodeMkdir(path, options) },
  async readFile(path, encoding) { return nodeReadFile(path, encoding) },
  async readdir(path) { return nodeReaddir(path) },
  async rm(path, options) { await nodeRm(path, options) },
  async writeFile(path, data, options) { await nodeWriteFile(path, data, options) }
}

/** Collect every `automata.devPort` already claimed by a games/tools workspace. */
export async function scanDevPorts(fs: ScaffoldFs, root: string): Promise<number[]> {
  const ports: number[] = []
  for (const group of ['games', 'tools']) {
    let entries: string[]
    try {
      entries = await fs.readdir(resolve(root, group))
    } catch {
      continue
    }
    for (const entry of entries) {
      let source: string
      try {
        source = await fs.readFile(resolve(root, group, entry, 'package.json'), 'utf8')
      } catch {
        continue
      }
      const manifest = JSON.parse(source) as { automata?: { devPort?: unknown } }
      const port = manifest.automata?.devPort
      if (typeof port === 'number') ports.push(port)
    }
  }
  return ports
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined
}

function assertContained(parent: string, child: string): void {
  const path = relative(parent, child)
  if (path === '' || path.startsWith('..') || isAbsolute(path)) {
    throw new Error(`Scaffold path escapes its target: ${child}`)
  }
}

async function assertMissing(fs: ScaffoldFs, path: string): Promise<void> {
  try {
    await fs.lstat(path)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return
    throw error
  }
  throw new Error(`Game target already exists: ${path}`)
}

/**
 * Root wiring is convention-driven (`automata.devPort`, Playwright workspace
 * scan), so the scaffold writes exclusively inside `games/<name>/` — a failed
 * write rolls back the new game directory and nothing else.
 */
export function createNewGameWriter(fs: ScaffoldFs) {
  return async function writeNewGame(root: string, name: string, port?: number): Promise<void> {
    const existingPorts = await scanDevPorts(fs, root)
    const plan = planNewGame(name, { port, existingPorts })
    const gamesRoot = resolve(root, 'games')
    const target = resolve(gamesRoot, plan.name)
    assertContained(gamesRoot, target)
    await assertMissing(fs, target)

    let createdTarget = false
    try {
      await fs.mkdir(target)
      createdTarget = true
      for (const file of plan.files) {
        const path = resolve(root, file.path)
        assertContained(target, path)
        await fs.mkdir(dirname(path), { recursive: true })
        await fs.writeFile(path, file.content, { flag: 'wx' })
      }
    } catch (error) {
      if (createdTarget) {
        try {
          await fs.rm(target, { recursive: true, force: true })
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], 'Scaffold failed and rollback was incomplete')
        }
      }
      throw error
    }
  }
}

export const writeNewGame = createNewGameWriter(nodeFs)
