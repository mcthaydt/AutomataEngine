import { afterEach, describe, expect, it } from 'vitest'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNewGameWriter, writeNewGame, type ScaffoldFs } from '../src/write'

const roots: string[] = []
const rootPackageJson = `${JSON.stringify({ name: 'repo', scripts: { build: 'noop' } }, null, 2)}\n`
const rootPlaywrightConfig = 'export default {}\n'

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'automata-scaffold-'))
  roots.push(root)
  await mkdir(join(root, 'games'))
  await writeFile(join(root, 'package.json'), rootPackageJson)
  await writeFile(join(root, 'playwright.config.ts'), rootPlaywrightConfig)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('writeNewGame', () => {
  it('writes the game tree without touching any root files', async () => {
    const root = await makeRepo()
    await writeNewGame(root, 'starfall', 5188)

    const gamePackage = JSON.parse(await readFile(join(root, 'games/starfall/package.json'), 'utf8')) as {
      name: string
    }
    expect(gamePackage.name).toBe('starfall')
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(rootPackageJson)
    expect(await readFile(join(root, 'playwright.config.ts'), 'utf8')).toBe(rootPlaywrightConfig)
  })

  it('refuses an existing target before creating any files', async () => {
    const root = await makeRepo()
    const existing = join(root, 'games/starfall/src/index.ts')
    await mkdir(join(root, 'games/starfall/src'), { recursive: true })
    await writeFile(existing, 'existing\n')

    await expect(writeNewGame(root, 'starfall', 5188)).rejects.toThrow(/already exists/i)
    await expect(lstat(join(root, 'games/starfall/package.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(existing, 'utf8')).toBe('existing\n')
  })

  it('rolls back the whole game tree when a file write fails', async () => {
    const root = await makeRepo()
    let remainingWrites = 2
    const fs: ScaffoldFs = {
      lstat,
      mkdir,
      readFile,
      readdir: async (path) => readdir(path),
      rm,
      async writeFile(path, data, options) {
        if (--remainingWrites < 0) throw new Error('simulated write failure')
        await writeFile(path, data, options)
      }
    }
    const writer = createNewGameWriter(fs)

    await expect(writer(root, 'starfall', 5188)).rejects.toThrow(/simulated write failure/i)
    await expect(lstat(join(root, 'games/starfall'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(rootPackageJson)
  })
})
