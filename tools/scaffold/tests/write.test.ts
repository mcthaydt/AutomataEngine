import { afterEach, describe, expect, it } from 'vitest'
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { createNewGameWriter, writeNewGame, type ScaffoldFs } from '../src/write'

const roots: string[] = []
const packageJson = `${JSON.stringify({
  name: 'repo',
  scripts: { build: 'npm run build -w monkey-ball' }
}, null, 2)}\n`
const playwrightConfig = `import { defineConfig } from '@playwright/test'

export default defineConfig({
  webServer: [
    { command: 'npm run dev:game', url: 'http://127.0.0.1:5174' }
  ]
})
`

async function makeRepo(playwright = playwrightConfig): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'automata-scaffold-'))
  roots.push(root)
  await mkdir(join(root, 'games'))
  await writeFile(join(root, 'package.json'), packageJson)
  await writeFile(join(root, 'playwright.config.ts'), playwright)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('writeNewGame', () => {
  it('writes the game and automatically wires root configuration', async () => {
    const root = await makeRepo()
    await writeNewGame(root, 'starfall', 5188)

    const gamePackage = JSON.parse(await readFile(join(root, 'games/starfall/package.json'), 'utf8')) as {
      name: string
    }
    const rootPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(gamePackage.name).toBe('starfall')
    expect(rootPackage.scripts['dev:starfall']).toContain('--port 5188')
    expect(rootPackage.scripts.build).toContain('npm run build -w starfall')
    expect(await readFile(join(root, 'playwright.config.ts'), 'utf8')).toContain('npm run dev:starfall')
  })

  it('refuses an existing target before creating any files or changing root configuration', async () => {
    const root = await makeRepo()
    const existing = join(root, 'games/starfall/src/index.ts')
    await mkdir(join(root, 'games/starfall/src'), { recursive: true })
    await writeFile(existing, 'existing\n')

    await expect(writeNewGame(root, 'starfall', 5188)).rejects.toThrow(/already exists/i)
    await expect(lstat(join(root, 'games/starfall/package.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(existing, 'utf8')).toBe('existing\n')
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(packageJson)
    expect(await readFile(join(root, 'playwright.config.ts'), 'utf8')).toBe(playwrightConfig)
  })

  it('rejects malformed root configuration before creating the game tree', async () => {
    const root = await makeRepo('export default {}\n')
    await expect(writeNewGame(root, 'starfall', 5188)).rejects.toThrow(/webServer/i)
    await expect(lstat(join(root, 'games/starfall'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(packageJson)
  })

  it('rolls back the game tree and root files when a root write fails', async () => {
    const root = await makeRepo()
    let failPlaywrightWrite = true
    const fs: ScaffoldFs = {
      lstat,
      mkdir,
      readFile,
      rm,
      async writeFile(path, data, options) {
        if (path === join(root, 'playwright.config.ts') && failPlaywrightWrite) {
          failPlaywrightWrite = false
          throw new Error('simulated write failure')
        }
        await writeFile(path, data, options)
      }
    }
    const writer = createNewGameWriter(fs)

    await expect(writer(root, 'starfall', 5188)).rejects.toThrow(/simulated write failure/i)
    await expect(lstat(join(root, 'games/starfall'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(packageJson)
    expect(await readFile(join(root, 'playwright.config.ts'), 'utf8')).toBe(playwrightConfig)
  })
})
