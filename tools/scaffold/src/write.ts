import {
  lstat as nodeLstat,
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rm as nodeRm,
  writeFile as nodeWriteFile
} from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { planNewGame } from './plan'
import { wirePackageJson, wirePlaywrightConfig } from './rootWiring'

export interface ScaffoldFs {
  lstat(path: string): Promise<unknown>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>
  readFile(path: string, encoding: 'utf8'): Promise<string>
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>
  writeFile(path: string, data: string, options?: { flag?: string }): Promise<void>
}

const nodeFs: ScaffoldFs = {
  async lstat(path) { await nodeLstat(path) },
  async mkdir(path, options) { await nodeMkdir(path, options) },
  async readFile(path, encoding) { return nodeReadFile(path, encoding) },
  async rm(path, options) { await nodeRm(path, options) },
  async writeFile(path, data, options) { await nodeWriteFile(path, data, options) }
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

export function createNewGameWriter(fs: ScaffoldFs) {
  return async function writeNewGame(root: string, name: string, port?: number): Promise<void> {
    const plan = planNewGame(name, port)
    const gamesRoot = resolve(root, 'games')
    const target = resolve(gamesRoot, plan.name)
    assertContained(gamesRoot, target)
    await assertMissing(fs, target)

    const packagePath = resolve(root, 'package.json')
    const playwrightPath = resolve(root, 'playwright.config.ts')
    const [originalPackage, originalPlaywright] = await Promise.all([
      fs.readFile(packagePath, 'utf8'),
      fs.readFile(playwrightPath, 'utf8')
    ])
    const nextPackage = wirePackageJson(originalPackage, plan.name, plan.port)
    const nextPlaywright = wirePlaywrightConfig(originalPlaywright, plan.name, plan.port)

    let createdTarget = false
    let packageAttempted = false
    let playwrightAttempted = false
    try {
      await fs.mkdir(target)
      createdTarget = true
      for (const file of plan.files) {
        const path = resolve(root, file.path)
        assertContained(target, path)
        await fs.mkdir(dirname(path), { recursive: true })
        await fs.writeFile(path, file.content, { flag: 'wx' })
      }

      packageAttempted = true
      await fs.writeFile(packagePath, nextPackage)
      playwrightAttempted = true
      await fs.writeFile(playwrightPath, nextPlaywright)
    } catch (error) {
      const rollbackErrors: unknown[] = []
      if (packageAttempted) {
        try { await fs.writeFile(packagePath, originalPackage) } catch (rollbackError) { rollbackErrors.push(rollbackError) }
      }
      if (playwrightAttempted) {
        try { await fs.writeFile(playwrightPath, originalPlaywright) } catch (rollbackError) { rollbackErrors.push(rollbackError) }
      }
      if (createdTarget) {
        try { await fs.rm(target, { recursive: true, force: true }) } catch (rollbackError) { rollbackErrors.push(rollbackError) }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError([error, ...rollbackErrors], 'Scaffold failed and rollback was incomplete')
      }
      throw error
    }
  }
}

export const writeNewGame = createNewGameWriter(nodeFs)
