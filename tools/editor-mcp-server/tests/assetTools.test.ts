import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionEngine, type SessionEngine } from '@automata/build-session'
import { gameSpecSchema, minimalGameSpecDraft } from '@automata/contracts'
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
  const manifestPath = join(gameDir, 'assets', 'assets.json')
  await mkdir(join(gameDir, 'assets'), { recursive: true })
  await mkdir(join(gameDir, 'project'), { recursive: true })
  if (manifest) await writeFile(manifestPath, JSON.stringify(manifest))
  await writeFile(join(gameDir, 'assets', 'item-icon.svg'), '<svg></svg>')
  await writeFile(join(gameDir, 'project', 'composition.json'), JSON.stringify(COMPOSITION))
  const { engine } = await createSessionEngine({
    sessionsRoot: join(repoRoot, '.automata', 'sessions'),
    gameId: 'demo-game',
    projectDir: join(gameDir, 'project'),
    engineVersion: 'test',
    lock: false
  })
  engines.push(engine)
  const runner = createAssetToolRunner({
    repoRoot,
    ensureEngine: async () => engine,
    snapshotContent: async () => ({ hash: await readFile(manifestPath, 'utf8') })
  })
  return { runner, engine, manifestPath, repoRoot }
}

async function setupWithSpec(assets: unknown[] = [
  { id: 'relic-icon', kind: 'ui', description: 'Icon.' },
  { id: 'pickup-blip', kind: 'audio', description: 'Blip.' }
]) {
  const context = await setup(null)
  const spec = gameSpecSchema.parse({
    specVersion: 1,
    provenance: {
      prompt: 'demo prompt',
      translations: [],
      history: [{ version: 1, reason: 'initial draft' }]
    },
    ...minimalGameSpecDraft('demo-game'),
    assets
  })
  await writeFile(
    join(context.repoRoot, 'games', 'demo-game', 'gamespec.json'),
    JSON.stringify(spec)
  )
  return context
}

async function setCompositionSeed(repoRoot: string, seed: number): Promise<void> {
  await writeFile(
    join(repoRoot, 'games', 'demo-game', 'public', 'project', 'composition.json'),
    JSON.stringify({ ...COMPOSITION, assets: [], source: { specVersion: 1, specHash: 'spec-hash', seed } })
  )
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

  it('validateAssets reports schema errors and persists a typed asset finding', async () => {
    const invalid = { ...V2_MANIFEST, assets: [{ ...V2_MANIFEST.assets[0]!, status: 'shiny' }] }
    const { runner, engine } = await setup(invalid)
    const result = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect(result).toMatchObject({
      ok: true,
      content: {
        errorCount: 1,
        warningCount: 0,
        issues: [expect.objectContaining({ code: 'asset-schema-invalid', severity: 'error', assetId: null })]
      }
    })
    expect(engine.summary().openFindings).toEqual([
      expect.objectContaining({ source: 'asset', code: 'asset-schema-invalid' })
    ])
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
    const stale = await engine.addFinding({
      source: 'asset', severity: 'error', code: 'asset-status-invalid', message: 'old', inputHash: 'old'
    })
    const result = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect(result.ok).toBe(true)
    expect(result.content).toEqual(expect.objectContaining({ errorCount: 0 }))
    expect(stale.resolvedAt).toBeDefined()
    expect(engine.session.findings.filter((entry) => entry.source === 'asset' && entry.resolvedAt === undefined)).toEqual([])
  })

  it('deduplicates unchanged failures and resolves findings absent from a changed run', async () => {
    const statusError = { ...V2_MANIFEST.assets[0]!, status: 'validated' }
    const twoErrors = { ...V2_MANIFEST, assets: [{ ...statusError, path: 'assets/wrong.svg' }] }
    const { runner, engine, manifestPath } = await setup(twoErrors)

    await runner.execute('validateAssets', { gameId: 'demo-game' })
    await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect(engine.summary().openFindings.map((finding) => finding.code).sort()).toEqual([
      'asset-media-invalid',
      'asset-path-mismatch',
    ])

    await writeFile(manifestPath, JSON.stringify({ ...V2_MANIFEST, assets: [statusError] }))
    await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect(engine.summary().openFindings.map((finding) => finding.code)).toEqual(['asset-status-invalid'])
    expect(engine.session.findings.find((finding) => finding.code === 'asset-path-mismatch')?.resolvedAt).toBeDefined()
  })
})

describe('generateAssets', () => {
  it('generates all spec requirements, writes files, merges the manifest', async () => {
    const { runner, repoRoot } = await setupWithSpec()
    const result = await runner.execute('generateAssets', { gameId: 'demo-game', seed: 42 })
    expect(result.ok).toBe(true)
    const content = (result as {
      content: {
        seed: number
        assets: Array<{ id: string; path: string; provider: string; status: string }>
      }
    }).content
    expect(content.seed).toBe(42)
    expect(content.assets.map((asset) => asset.id)).toEqual(['relic-icon', 'pickup-blip'])
    const svg = await readFile(
      join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'relic-icon.svg'),
      'utf8'
    )
    expect(svg).toContain('<svg')
    const manifest = JSON.parse(await readFile(
      join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'assets.json'),
      'utf8'
    ))
    expect(manifest.formatVersion).toBe(2)
    expect(manifest.assets).toHaveLength(2)
    expect(manifest.assets[0].status).toBe('generated')
  })

  it('is idempotent for a given seed and honors assetIds subsetting', async () => {
    const { runner, repoRoot } = await setupWithSpec()
    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 42 })
    const audioPath = join(
      repoRoot,
      'games',
      'demo-game',
      'public',
      'assets',
      'pickup-blip.wav'
    )
    const firstBytes = await readFile(audioPath)
    await runner.execute('generateAssets', {
      gameId: 'demo-game',
      seed: 42,
      assetIds: ['pickup-blip']
    })
    const secondBytes = await readFile(audioPath)
    expect(Buffer.compare(firstBytes, secondBytes)).toBe(0)
    const manifest = JSON.parse(await readFile(
      join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'assets.json'),
      'utf8'
    ))
    expect(manifest.assets).toHaveLength(2)
  })

  it('falls back to composition.source.seed when seed is omitted', async () => {
    const { runner, repoRoot } = await setupWithSpec()
    await writeFile(
      join(repoRoot, 'games', 'demo-game', 'public', 'project', 'composition.json'),
      JSON.stringify({
        ...COMPOSITION,
        source: { specVersion: 1, specHash: 'spec-hash', seed: 73 }
      })
    )

    const result = await runner.execute('generateAssets', { gameId: 'demo-game' })

    expect(result).toMatchObject({ ok: true, content: { seed: 73 } })
  })

  it('defensively merges duplicate spec requirements by id', async () => {
    const requirement = { id: 'relic-icon', kind: 'ui', description: 'Icon.' }
    const { runner, repoRoot } = await setupWithSpec([requirement, requirement])

    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 1 })

    const manifest = JSON.parse(await readFile(
      join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'assets.json'),
      'utf8'
    ))
    expect(manifest.assets.map((entry: { id: string }) => entry.id)).toEqual(['relic-icon'])
  })

  it('fails with typed errors on unknown assetIds, missing gamespec, and missing seed', async () => {
    const withSpec = await setupWithSpec()
    await expect(withSpec.runner.execute('generateAssets', {
      gameId: 'demo-game',
      seed: 1,
      assetIds: ['nope']
    })).rejects.toThrow(/nope/)
    await expect(withSpec.runner.execute('generateAssets', { gameId: 'demo-game' }))
      .rejects.toThrow(/seed/)
    const bare = await setup(V2_MANIFEST)
    await expect(bare.runner.execute('generateAssets', { gameId: 'demo-game', seed: 1 }))
      .rejects.toThrow(/gamespec/)
  })
})

describe('validateAssets media gate', () => {
  it('validates media, flips generated to validated, and records a passing check:assets step', async () => {
    const { runner, repoRoot, engine } = await setupWithSpec([
      { id: 'icon-a', kind: 'ui', description: 'Icon.' },
      { id: 'crate-a', kind: 'model', description: 'Crate.' },
      { id: 'blip-a', kind: 'audio', description: 'Blip.' }
    ])
    await setCompositionSeed(repoRoot, 7)
    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7 })
    const result = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect(result.ok).toBe(true)
    const content = result.content as { passed: boolean; statuses: Record<string, string> }
    expect(content.passed).toBe(true)
    expect(Object.values(content.statuses).every((status) => status === 'validated')).toBe(true)
    const gameRoot = join(repoRoot, 'games', 'demo-game')
    const manifest = JSON.parse(await readFile(join(gameRoot, 'public/assets/assets.json'), 'utf8'))
    expect(manifest.assets.every((entry: { status: string }) => entry.status === 'validated')).toBe(true)
    // ES2022 has no Array.findLast; reverse a copy to inspect the latest check.
    const step = [...engine.session.steps].reverse().find((candidate) => candidate.kind === 'check:assets')
    expect(step?.status).toBe('completed')
    expect((step?.result as { passed?: boolean }).passed).toBe(true)
  })

  it('flips a corrupted asset to failed, records a finding, and fails the gate', async () => {
    const { runner, repoRoot, engine } = await setupWithSpec()
    await setCompositionSeed(repoRoot, 7)
    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7 })
    const gameRoot = join(repoRoot, 'games', 'demo-game')
    const manifest = JSON.parse(await readFile(join(gameRoot, 'public/assets/assets.json'), 'utf8'))
    const target = manifest.assets[0]
    await writeFile(join(gameRoot, 'public', target.path), 'corrupted')
    const result = await runner.execute('validateAssets', { gameId: 'demo-game' })
    const content = result.content as { passed: boolean; statuses: Record<string, string> }
    expect(content.passed).toBe(false)
    expect(content.statuses[target.id]).toBe('failed')
    const open = engine.session.findings.filter((finding) => finding.source === 'asset' && finding.resolvedAt === undefined)
    expect(open.some((finding) => finding.code === 'asset-media-invalid')).toBe(true)
  })

  it('regenerating and revalidating a failed asset returns it to validated', async () => {
    const { runner, repoRoot } = await setupWithSpec()
    await setCompositionSeed(repoRoot, 7)
    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7 })
    const gameRoot = join(repoRoot, 'games', 'demo-game')
    const manifest = JSON.parse(await readFile(join(gameRoot, 'public/assets/assets.json'), 'utf8'))
    const target = manifest.assets[0]
    await writeFile(join(gameRoot, 'public', target.path), 'corrupted')
    await runner.execute('validateAssets', { gameId: 'demo-game' })
    await runner.execute('generateAssets', { gameId: 'demo-game', assetIds: [target.id], seed: 7 })
    const result = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect((result.content as { statuses: Record<string, string> }).statuses[target.id]).toBe('validated')
  })
})

describe('regenerateAsset', () => {
  it('regenerates exactly one asset behind its stable id, leaving every other byte untouched', async () => {
    const { runner, repoRoot } = await setupWithSpec()
    await setCompositionSeed(repoRoot, 7)
    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7 })
    await runner.execute('validateAssets', { gameId: 'demo-game' })
    const gameRoot = join(repoRoot, 'games', 'demo-game')
    const before = JSON.parse(await readFile(join(gameRoot, 'public/assets/assets.json'), 'utf8'))
    const [target, ...others] = before.assets
    const otherBytes = await Promise.all(others.map(async (entry: { path: string }) =>
      Buffer.from(await readFile(join(gameRoot, 'public', entry.path))).toString('hex')))

    const result = await runner.execute('regenerateAsset', { gameId: 'demo-game', assetId: target.id, seed: 7 })
    expect(result.ok).toBe(true)

    const after = JSON.parse(await readFile(join(gameRoot, 'public/assets/assets.json'), 'utf8'))
    const regenerated = after.assets.find((entry: { id: string }) => entry.id === target.id)
    expect(regenerated.status).toBe('generated')
    expect(regenerated.references).toEqual(target.references)
    const untouched = after.assets.filter((entry: { id: string }) => entry.id !== target.id)
    expect(untouched).toEqual(others)
    const otherBytesAfter = await Promise.all(others.map(async (entry: { path: string }) =>
      Buffer.from(await readFile(join(gameRoot, 'public', entry.path))).toString('hex')))
    expect(otherBytesAfter).toEqual(otherBytes)
    const targetBytes = await readFile(join(gameRoot, 'public', target.path))
    await runner.execute('regenerateAsset', { gameId: 'demo-game', assetId: target.id, seed: 7 })
    expect(await readFile(join(gameRoot, 'public', target.path))).toEqual(targetBytes)
  })

  it('rejects unknown asset ids and missing seeds with typed errors', async () => {
    const withSpec = await setupWithSpec()
    await expect(withSpec.runner.execute('regenerateAsset', { gameId: 'demo-game', assetId: 'nope', seed: 7 }))
      .rejects.toThrow(/Unknown asset id/)
    const noComposition = await setupWithSpec()
    await expect(noComposition.runner.execute('regenerateAsset', { gameId: 'demo-game', assetId: 'relic-icon' }))
      .rejects.toThrow(/No seed/)
  })
})
