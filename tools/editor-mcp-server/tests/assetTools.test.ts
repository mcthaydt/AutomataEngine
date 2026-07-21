import * as fs from 'node:fs/promises'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { sha256Hex, svgPaletteColors } from '@automata/asset-providers'
import { createSessionEngine, type SessionEngine } from '@automata/build-session'
import { gameSpecSchema, minimalGameSpecDraft, type AssetProvider } from '@automata/contracts'
import { createAssetToolRunner } from '../src/assetTools'
import { writeComposedFiles, type ComposedFile, type ComposedWriterFs } from '../src/composedWriter'

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

type AssetWriter = (root: string, files: readonly ComposedFile[]) => Promise<void>

async function setup(
  manifest: unknown | null,
  namedProviders?: Record<string, AssetProvider>,
  writeFiles?: AssetWriter
) {
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
    snapshotContent: async () => ({ hash: await readFile(manifestPath, 'utf8') }),
    namedProviders,
    writeFiles
  })
  return { runner, engine, manifestPath, repoRoot }
}

async function setupWithSpec(assets: unknown[] = [
  { id: 'relic-icon', kind: 'ui', description: 'Icon.' },
  { id: 'pickup-blip', kind: 'audio', description: 'Blip.' }
], namedProviders?: Record<string, AssetProvider>, writeFiles?: AssetWriter) {
  const context = await setup(null, namedProviders, writeFiles)
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
  it('rejects tampered pinned bytes even when the game has no gamespec', async () => {
    const pinned = {
      ...V2_MANIFEST,
      assets: [{
        ...V2_MANIFEST.assets[0]!,
        status: 'generated',
        provenance: {
          ...V2_MANIFEST.assets[0]!.provenance,
          provider: 'claude-svg',
          determinism: { kind: 'pinned', contentHash: 'definitely-wrong' }
        }
      }]
    }
    const { runner } = await setup(pinned)
    const result = await runner.execute('validateAssets', { gameId: 'demo-game' })
    const content = result.content as { statuses: Record<string, string>; issues: Array<{ code: string }> }
    expect(content.statuses['item-icon']).toBe('failed')
    expect(content.issues.some((issue) => issue.code === 'asset-hash-mismatch')).toBe(true)
  })

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

const FAKE_AI_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" fill="none"/></svg>\n'
const fakeAiProvider: AssetProvider = {
  id: 'ai-fake', version: '1.0.0', kinds: ['ui', 'texture'],
  fileExtension: () => 'svg',
  async generate(requirement, ctx) {
    const bytes = new TextEncoder().encode(FAKE_AI_SVG)
    return {
      bytes,
      provenance: {
        provider: 'ai-fake', providerVersion: '1.0.0', generator: 'fake-model',
        sourceParams: { prompt: 'fake' }, seed: ctx.seed, specVersion: ctx.specVersion,
        determinism: { kind: 'pinned', contentHash: sha256Hex(bytes) },
        license: { kind: 'generated', notes: 'test' }
      }
    }
  }
}

const paletteAiProvider: AssetProvider = {
  ...fakeAiProvider,
  id: 'palette-ai',
  async generate(requirement, ctx) {
    const color = svgPaletteColors(ctx.style)[0]!
    const bytes = new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="${color}"/></svg>\n`
    )
    return {
      bytes,
      provenance: {
        provider: 'palette-ai', providerVersion: '1.0.0', generator: 'fake-model',
        sourceParams: { prompt: 'fake' }, seed: ctx.seed, specVersion: ctx.specVersion,
        determinism: { kind: 'pinned', contentHash: sha256Hex(bytes) },
        license: { kind: 'generated', notes: 'test' }
      }
    }
  }
}

const UI_ONLY_ASSETS = [{ id: 'relic-icon', kind: 'ui', description: 'Icon.' }]

describe('provider override', () => {
  it('generateAssets with provider routes through the injected provider and pins the entry', async () => {
    const { runner, manifestPath } = await setupWithSpec(UI_ONLY_ASSETS, { 'ai-fake': fakeAiProvider })
    const result = await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'ai-fake' })
    expect(result.ok).toBe(true)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const entry = manifest.assets.find((candidate: { id: string }) => candidate.id === 'relic-icon')
    expect(entry.provenance.provider).toBe('ai-fake')
    expect(entry.provenance.determinism.kind).toBe('pinned')
    expect(entry.status).toBe('generated')
  })

  it('preserves existing manifest references when generateAssets replaces an entry', async () => {
    const { runner, manifestPath } = await setupWithSpec(UI_ONLY_ASSETS, { 'ai-fake': fakeAiProvider })
    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'ai-fake' })
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.assets[0].references = ['public/project/composition.json']
    await writeFile(manifestPath, JSON.stringify(manifest))

    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'ai-fake' })

    const replaced = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(replaced.assets[0].references).toEqual(['public/project/composition.json'])
  })

  it('records the explicit style seed so validation does not reconstruct from the composition seed', async () => {
    const { runner, repoRoot, manifestPath } = await setupWithSpec(UI_ONLY_ASSETS, { 'palette-ai': paletteAiProvider })
    await setCompositionSeed(repoRoot, 99)
    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'palette-ai' })

    const generated = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(generated.assets[0].provenance.sourceParams.styleSeed).toBe(7)
    const validated = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect((validated.content as { statuses: Record<string, string> }).statuses['relic-icon']).toBe('validated')
  })

  it('regenerateAsset with provider preserves the flow and re-guards under the provider key', async () => {
    const { runner } = await setupWithSpec(UI_ONLY_ASSETS, { 'ai-fake': fakeAiProvider })
    const procedural = await runner.execute('regenerateAsset', { gameId: 'demo-game', assetId: 'relic-icon', seed: 7 })
    const viaAi = await runner.execute('regenerateAsset', { gameId: 'demo-game', assetId: 'relic-icon', seed: 7, provider: 'ai-fake' })
    // Different guarded-step inputs: the AI regeneration must NOT be served
    // from the procedural step's cache.
    expect(viaAi.ok).toBe(true)
    expect((viaAi.content as { cached: boolean }).cached).toBe(false)
    expect((procedural.content as { id: string }).id).toBe('relic-icon')
  })

  it('rejects an unknown provider id, listing known providers', async () => {
    const { runner } = await setupWithSpec(UI_ONLY_ASSETS, { 'ai-fake': fakeAiProvider })
    await expect(runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'nope' }))
      .rejects.toThrow(/Unknown provider "nope".*ai-fake/)
  })

  it('rejects a provider that does not support a requirement kind', async () => {
    // Default spec assets include pickup-blip (audio); the fake provider is ui/texture only.
    const { runner } = await setupWithSpec(undefined, { 'ai-fake': fakeAiProvider })
    await expect(runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'ai-fake' }))
      .rejects.toThrow(/does not support kind "audio"/)
  })

  it('preflights every requirement kind before calling the provider', async () => {
    let calls = 0
    const countingProvider: AssetProvider = {
      ...fakeAiProvider,
      async generate(requirement, ctx) {
        calls += 1
        return fakeAiProvider.generate(requirement, ctx)
      }
    }
    const { runner } = await setupWithSpec(undefined, { 'ai-fake': countingProvider })
    await expect(runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'ai-fake' }))
      .rejects.toThrow(/does not support kind "audio"/)
    expect(calls).toBe(0)
  })

  it('validates the existing manifest before provider calls or asset writes', async () => {
    let calls = 0
    const countingProvider: AssetProvider = {
      ...fakeAiProvider,
      async generate(requirement, ctx) {
        calls += 1
        return fakeAiProvider.generate(requirement, ctx)
      }
    }
    const { runner, repoRoot, manifestPath } = await setupWithSpec(UI_ONLY_ASSETS, { 'ai-fake': countingProvider })
    const assetPath = join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'relic-icon.svg')
    await writeFile(manifestPath, 'not-json')
    await writeFile(assetPath, 'original-bytes')

    await expect(runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'ai-fake' }))
      .rejects.toThrow()
    expect(calls).toBe(0)
    expect(await readFile(assetPath, 'utf8')).toBe('original-bytes')
    expect(await readFile(manifestPath, 'utf8')).toBe('not-json')
  })

  it('stages assets before the manifest and rolls every file back on commit failure', async () => {
    const context = await setupWithSpec(UI_ONLY_ASSETS, { 'ai-fake': fakeAiProvider })
    await context.runner.execute('generateAssets', {
      gameId: 'demo-game', seed: 7, provider: 'ai-fake'
    })
    const assetPath = join(context.repoRoot, 'games', 'demo-game', 'public', 'assets', 'relic-icon.svg')
    const originalAsset = await readFile(assetPath)
    const originalManifest = await readFile(context.manifestPath)
    let renames = 0
    let paths: string[] = []
    const injected: ComposedWriterFs = {
      ...fs,
      async rename(from, to) {
        renames += 1
        if (renames === 4) throw new Error('injected asset commit failure')
        await fs.rename(from, to)
      }
    }
    const writeFiles: AssetWriter = async (root, files) => {
      paths = files.map((file) => file.path)
      await writeComposedFiles(root, files, injected)
    }
    const runner = createAssetToolRunner({
      repoRoot: context.repoRoot,
      ensureEngine: async () => context.engine,
      snapshotContent: async () => ({ hash: await readFile(context.manifestPath, 'utf8') }),
      namedProviders: { 'ai-fake': fakeAiProvider },
      writeFiles
    })

    await expect(runner.execute('generateAssets', {
      gameId: 'demo-game', seed: 8, provider: 'ai-fake'
    })).rejects.toThrow('injected asset commit failure')
    expect(paths.at(-1)).toBe('public/assets/assets.json')
    expect(await readFile(assetPath)).toEqual(originalAsset)
    expect(await readFile(context.manifestPath)).toEqual(originalManifest)
    expect((await readdir(dirname(assetPath))).filter((name) => name.includes('.tmp-') || name.includes('.bak-'))).toEqual([])
  })

  it('serializes concurrent same-game generation so disjoint manifest entries are retained', async () => {
    const assets = [
      { id: 'icon-a', kind: 'ui', description: 'A.' },
      { id: 'icon-b', kind: 'ui', description: 'B.' }
    ]
    const yieldingProvider: AssetProvider = {
      ...fakeAiProvider,
      async generate(requirement, ctx) {
        await Promise.resolve()
        return fakeAiProvider.generate(requirement, ctx)
      }
    }
    const { runner, manifestPath } = await setupWithSpec(assets, { 'ai-fake': yieldingProvider })

    await Promise.all([
      runner.execute('generateAssets', { gameId: 'demo-game', assetIds: ['icon-a'], seed: 7, provider: 'ai-fake' }),
      runner.execute('generateAssets', { gameId: 'demo-game', assetIds: ['icon-b'], seed: 7, provider: 'ai-fake' })
    ])

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(manifest.assets.map((entry: { id: string }) => entry.id).sort()).toEqual(['icon-a', 'icon-b'])
  })

  it('validateAssets flips a matching pinned entry to validated and a tampered one to failed', async () => {
    const { runner, repoRoot } = await setupWithSpec(UI_ONLY_ASSETS, { 'ai-fake': fakeAiProvider })
    await runner.execute('generateAssets', { gameId: 'demo-game', seed: 7, provider: 'ai-fake' })
    const clean = await runner.execute('validateAssets', { gameId: 'demo-game' })
    expect((clean.content as { statuses: Record<string, string> }).statuses['relic-icon']).toBe('validated')

    // Tamper with the pinned bytes on disk (keep it valid on-palette SVG so only the hash trips)
    await writeFile(join(repoRoot, 'games', 'demo-game', 'public', 'assets', 'relic-icon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" fill="none"/></svg>\n')
    const tampered = await runner.execute('validateAssets', { gameId: 'demo-game' })
    const content = tampered.content as { statuses: Record<string, string>; issues: Array<{ code: string }> }
    expect(content.statuses['relic-icon']).toBe('failed')
    expect(content.issues.some((issue) => issue.code === 'asset-hash-mismatch')).toBe(true)
  })
})
