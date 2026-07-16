import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEngine, type SessionEngine } from '@automata/build-session'
import { createAssetToolRunner } from '../src/assetTools'

const V2_MANIFEST = {
  formatVersion: 2,
  assets: [{
    id: 'item-icon',
    requirement: { id: 'item-icon', kind: 'ui', description: 'Icon.' },
    path: 'assets/item-icon.svg',
    provenance: {
      provider: 'stub-generator', providerVersion: '1.0.0', generator: 'svg-icon@1',
      sourceParams: {}, seed: 1, specVersion: 1,
      determinism: { kind: 'seeded' }, license: { kind: 'generated', notes: '' }
    },
    transformations: [],
    status: 'placeholder',
    references: ['public/project/composition.json']
  }]
}
const COMPOSITION = {
  formatVersion: 1, gameId: 'demo-game', source: null, packs: [],
  assets: [{ id: 'item-icon', path: 'assets/item-icon.svg' }]
}

const roots: string[] = []
const engines: SessionEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.dispose()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup(manifest: unknown | null) {
  const repoRoot = await mkdtemp(join(tmpdir(), 'asset-tools-'))
  roots.push(repoRoot)
  const gameDir = join(repoRoot, 'games', 'demo-game', 'public')
  await mkdir(join(gameDir, 'assets'), { recursive: true })
  await mkdir(join(gameDir, 'project'), { recursive: true })
  if (manifest) await writeFile(join(gameDir, 'assets', 'assets.json'), JSON.stringify(manifest))
  await writeFile(join(gameDir, 'project', 'composition.json'), JSON.stringify(COMPOSITION))
  const { engine } = await createSessionEngine({
    sessionsRoot: join(repoRoot, '.automata', 'sessions'),
    gameId: 'demo-game',
    projectDir: join(gameDir, 'project'),
    engineVersion: 'test',
    lock: false
  })
  engines.push(engine)
  const runner = createAssetToolRunner({ repoRoot, ensureEngine: async () => engine })
  return { runner, engine }
}

describe('asset MCP tools', () => {
  it('listAssets returns each asset with its full provenance', async () => {
    const { runner } = await setup(V2_MANIFEST)
    const result = await runner.execute('listAssets', { gameId: 'demo-game' })
    expect(result.ok).toBe(true)
    expect(result.content).toEqual({
      formatVersion: 2,
      assets: [{
        id: 'item-icon', kind: 'ui', path: 'assets/item-icon.svg',
        status: 'placeholder', provenance: V2_MANIFEST.assets[0]!.provenance
      }]
    })
  })

  it('listAssets reports a missing manifest without erroring', async () => {
    const { runner } = await setup(null)
    const result = await runner.execute('listAssets', { gameId: 'demo-game' })
    expect(result.ok).toBe(true)
    expect(result.content).toEqual({ missing: true, assets: [] })
  })

  it('validateAssets returns issues and persists error findings under source asset', async () => {
    const bad = { ...V2_MANIFEST, assets: [{ ...V2_MANIFEST.assets[0]!, status: 'validated' }] }
    const { runner, engine } = await setup(bad)
    const result = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect(result.ok).toBe(true)
    expect(result.content).toEqual(expect.objectContaining({ errorCount: 1, warningCount: 0 }))
    const finding = engine.session.findings.find((entry) => entry.source === 'asset')
    expect(finding).toBeDefined()
    expect(finding!.code).toBe('asset-status-invalid')
  })

  it('validateAssets auto-resolves asset findings when clean', async () => {
    const { runner, engine } = await setup(V2_MANIFEST)
    const result = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect(result.ok).toBe(true)
    expect(result.content).toEqual(expect.objectContaining({ errorCount: 0 }))
    expect(engine.session.findings.filter((entry) => entry.source === 'asset' && entry.resolvedAt === undefined)).toEqual([])
  })
})
