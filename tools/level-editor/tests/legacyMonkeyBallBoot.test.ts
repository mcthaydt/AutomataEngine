import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLoader } from '@automata/engine'
import { describe, expect, it } from 'vitest'
import { loadLegacyMonkeyBallBootData } from '../src/legacyMonkeyBallBoot'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('legacy Monkey Ball editor boot bridge', () => {
  it('loads only the tuning and archetypes required by the legacy editor definition', async () => {
    const requested: string[] = []
    const loader = createLoader(async (path) => {
      requested.push(path)
      return readFile(resolve(repoRoot, 'games/monkey-ball/public', path.slice(1)), 'utf8')
    })

    const boot = await loadLegacyMonkeyBallBootData(loader)

    expect(requested).toEqual([
      '/data/config/physics.toml',
      '/data/archetypes/standard.yaml'
    ])
    expect(boot.tuning.gravity).toBe(9.81)
    expect(boot.lib.ball).toBeDefined()
  })
})
