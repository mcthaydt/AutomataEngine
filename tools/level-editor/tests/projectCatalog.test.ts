import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createProjectCatalog } from '../src/projectCatalog'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('project catalog', () => {
  it('registers exactly the two shipped games with valid templates', async () => {
    const catalog = await createProjectCatalog({
      readText: (path) => readFile(resolve(repoRoot, 'games/monkey-ball/public', path.replace(/^\//, '')), 'utf8')
    })

    expect(catalog.list().map((registration) => registration.gameId)).toEqual([
      'monkey-ball',
      'pulsebreak'
    ])
    expect(new Set(catalog.list().map((registration) => registration.gameId)).size).toBe(2)
    for (const registration of catalog.list()) {
      expect(registration.createTemplate().manifest.gameId).toBe(registration.gameId)
      expect(catalog.get(registration.gameId)).toBe(registration)
    }
    expect(catalog.get('missing')).toBeUndefined()
  })
})
