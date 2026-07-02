import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { discoverGames, loadProjectRegistration } from '../src/projectCatalog'

const testDir = dirname(fileURLToPath(import.meta.url))
const badRepoRoot = resolve(testDir, 'fixtures/badRepo')

describe('project catalog discovery', () => {
  it('discovers exactly the games exposing the ./project export convention', async () => {
    await expect(discoverGames()).resolves.toEqual(['monkey-ball', 'pulsebreak'])
  })

  it('rejects games whose package name does not match their directory', async () => {
    await expect(discoverGames(badRepoRoot)).rejects.toThrow(/mismatch.*not-mismatch/)
  })

  it('loads monkey-ball headlessly against its shipped archetype data', async () => {
    const registration = await loadProjectRegistration('monkey-ball')
    expect(registration.gameId).toBe('monkey-ball')
    expect(registration.evaluate).toBeDefined()
    expect(registration.createPreview).toBeUndefined()
  })

  it('loads pulsebreak headlessly', async () => {
    const registration = await loadProjectRegistration('pulsebreak')
    expect(registration.gameId).toBe('pulsebreak')
    expect(registration.evaluate).toBeDefined()
  })

  it('rejects unknown game ids, listing what was discovered', async () => {
    await expect(loadProjectRegistration('nope')).rejects.toThrow(/monkey-ball, pulsebreak/)
  })
})
