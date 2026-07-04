import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createProjectCatalog } from '../src/projectCatalog'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('project catalog', () => {
  it('registers the shipped games with valid templates', async () => {
    const catalog = await createProjectCatalog({
      readText: (path) => readFile(resolve(repoRoot, 'games/monkey-ball/public', path.replace(/^\//, '')), 'utf8')
    })

    const gameIds = catalog.list().map((registration) => registration.gameId)
    expect(gameIds).toEqual(expect.arrayContaining(['monkey-ball', 'pulsebreak']))
    expect(new Set(gameIds).size).toBe(gameIds.length)
    for (const registration of catalog.list()) {
      expect(registration.createTemplate().manifest.gameId).toBe(registration.gameId)
      expect(catalog.get(registration.gameId)).toBe(registration)
    }
    expect(catalog.get('missing')).toBeUndefined()
  })

  it('discovers games by convention rather than hardcoded imports', async () => {
    const source = await readFile(resolve(repoRoot, 'tools/level-editor/src/projectCatalog.ts'), 'utf8')
    expect(source).toContain('import.meta.glob')
    expect(source).not.toMatch(/from '(monkey-ball|pulsebreak)\/editor'/)
  })

  it('keeps previews for discovered games', async () => {
    const catalog = await createProjectCatalog({
      readText: (path) => readFile(resolve(repoRoot, 'games/monkey-ball/public', path.replace(/^\//, '')), 'utf8')
    })
    for (const registration of catalog.list()) {
      expect(registration.createPreview).toBeDefined()
    }
  })
})
