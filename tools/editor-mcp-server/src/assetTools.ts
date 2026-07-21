import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildGeneratedAsset, deriveStyleParams, generateGameAssets, hashStringToSeed, validateAssetMedia } from '@automata/asset-providers'
import { hashJson, type SessionEngine } from '@automata/build-session'
import {
  assetManifestSchema,
  gameSpecSchema,
  parseAssetToolArgs,
  parseAssetManifest,
  parseCompositionManifest,
  validateAssetManifest,
  type AssetManifest,
  type AssetManifestEntry,
  type AssetIssue,
  type AssetStatus,
  type CompositionManifest,
  type AssetProvider,
  type GameSpec,
  type ToolResult
} from '@automata/contracts'
import { writeComposedFiles, type ComposedFile } from './composedWriter'

export interface AssetToolDeps {
  repoRoot: string
  ensureEngine(gameId: string): Promise<SessionEngine>
  snapshotContent(gameId: string): Promise<{ hash: string }>
  /** Non-default providers addressable via the tools' optional `provider` arg. */
  namedProviders?: Record<string, AssetProvider>
  /** Transactional game-file writer; injectable for persistence failure tests. */
  writeFiles?: (root: string, files: readonly ComposedFile[]) => Promise<void>
}

const ok = (content: unknown): ToolResult => ({ ok: true, content })
const issueKey = (issue: { code: string; message: string }): string => `${issue.code}\0${issue.message}`

/** Keep the open finding set equal to the current validation result. */
async function reconcileAssetFindings(engine: SessionEngine, errors: AssetIssue[], inputHash: string): Promise<void> {
  const open = engine.session.findings.filter((finding) => finding.source === 'asset' && finding.resolvedAt === undefined)
  const desiredKeys = new Set(errors.map(issueKey))
  const alreadyCurrent = open.length === errors.length && open.every((finding) =>
    finding.inputHash === inputHash && desiredKeys.has(issueKey(finding)))
  if (alreadyCurrent) return

  await engine.autoResolve('asset')
  for (const issue of errors) {
    await engine.addFinding({
      source: 'asset',
      severity: 'error',
      code: issue.code,
      message: issue.message,
      inputHash
    })
  }
}

async function readManifestText(repoRoot: string, gameId: string): Promise<string | null> {
  try {
    return await readFile(join(repoRoot, 'games', gameId, 'public', 'assets', 'assets.json'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function readComposition(repoRoot: string, gameId: string): Promise<CompositionManifest | null> {
  try {
    return parseCompositionManifest(await readFile(join(repoRoot, 'games', gameId, 'public', 'project', 'composition.json'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function readGameSpec(repoRoot: string, gameId: string) {
  const path = join(repoRoot, 'games', gameId, 'gamespec.json')
  try {
    return gameSpecSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Game "${gameId}" has no gamespec.json — generateAssets needs spec asset requirements`
      )
    }
    throw error
  }
}

/** Validation can still report structural results for legacy games without a spec. */
async function readGameSpecOptional(repoRoot: string, gameId: string) {
  const path = join(repoRoot, 'games', gameId, 'gamespec.json')
  try {
    return gameSpecSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** Replace generated ids, append new entries, and preserve unrelated assets. */
function mergeManifest(existingText: string | null, entries: AssetManifestEntry[]) {
  const existing = existingText
    ? parseAssetManifest(existingText)
    : { formatVersion: 2 as const, assets: [] }
  const generatedById = new Map(entries.map((entry) => [entry.id, entry]))
  const retained = existing.assets.map((entry) => {
    const replacement = generatedById.get(entry.id)
    if (!replacement) return entry
    generatedById.delete(entry.id)
    return { ...replacement, references: entry.references }
  })
  return assetManifestSchema.parse({
    formatVersion: 2,
    assets: [...retained, ...generatedById.values()]
  })
}

/** Route requirements through a named injected provider (the AI path). */
async function generateWithNamedProvider(
  deps: AssetToolDeps,
  spec: GameSpec,
  requirements: readonly GameSpec['assets'][number][],
  seed: number,
  providerId: string
) {
  const provider = deps.namedProviders?.[providerId]
  if (!provider) {
    const known = Object.keys(deps.namedProviders ?? {}).join(', ') || '(none)'
    throw new Error(`Unknown provider "${providerId}"; known providers: ${known}`)
  }
  for (const requirement of requirements) {
    if (!provider.kinds.includes(requirement.kind)) {
      throw new Error(`Provider "${providerId}" does not support kind "${requirement.kind}" (supports: ${provider.kinds.join(', ')})`)
    }
  }
  const style = deriveStyleParams(spec.direction, seed)
  const generated = []
  for (const requirement of requirements) {
    generated.push(await buildGeneratedAsset(requirement, provider, {
      seed: hashStringToSeed(`${seed}:${requirement.id}`),
      style,
      styleSeed: seed,
      specVersion: spec.specVersion
    }))
  }
  return generated
}

export function createAssetToolRunner(deps: AssetToolDeps) {
  const writeFiles = deps.writeFiles ?? writeComposedFiles
  const mutationTails = new Map<string, Promise<unknown>>()
  const serializeMutation = async <T>(gameId: string, task: () => Promise<T>): Promise<T> => {
    const previous = mutationTails.get(gameId) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(task)
    mutationTails.set(gameId, current)
    try {
      return await current
    } finally {
      if (mutationTails.get(gameId) === current) mutationTails.delete(gameId)
    }
  }

  const executeUnlocked = async (name: string, raw: unknown): Promise<ToolResult> => {
      if (name === 'regenerateAsset') {
        const args = parseAssetToolArgs(name, raw) as { gameId: string; assetId: string; seed?: number; provider?: string }
        const spec = await readGameSpec(deps.repoRoot, args.gameId)
        const requirement = spec.assets.find((entry) => entry.id === args.assetId)
        if (!requirement) {
          throw new Error(`Unknown asset id "${args.assetId}"; spec declares: ${spec.assets.map((entry) => entry.id).join(', ')}`)
        }
        const composition = await readComposition(deps.repoRoot, args.gameId)
        const seed = args.seed ?? composition?.source?.seed
        if (seed === undefined) {
          throw new Error('No seed: pass an explicit seed or compose the game first (composition.json source.seed)')
        }
        const engine = await deps.ensureEngine(args.gameId)
        const existingText = await readManifestText(deps.repoRoot, args.gameId)
        const existing = existingText ? parseAssetManifest(existingText) : { formatVersion: 2 as const, assets: [] }
        const guarded = await engine.runGuarded(
          'asset:regenerate',
          { assetId: args.assetId, seed, specVersion: spec.specVersion, provider: args.provider ?? null },
          async () => {
            const [generated] = args.provider
              ? await generateWithNamedProvider(deps, spec, [requirement], seed, args.provider)
              : await generateGameAssets({
                  requirements: [requirement], direction: spec.direction, seed, specVersion: spec.specVersion
                })
            return {
              ok: true,
              output: {
                path: generated!.path,
                entry: generated!.entry,
                bytesBase64: Buffer.from(generated!.bytes).toString('base64')
              }
            }
          }
        )
        const output = guarded.output as { path: string; entry: AssetManifestEntry; bytesBase64: string }
        const previous = existing.assets.find((entry) => entry.id === args.assetId)
        const entry = { ...output.entry, references: previous?.references ?? output.entry.references }
        const manifest = mergeManifest(existingText, [entry])
        await writeFiles(join(deps.repoRoot, 'games', args.gameId), [
          { path: `public/${output.path}`, base64: output.bytesBase64 },
          { path: 'public/assets/assets.json', text: `${JSON.stringify(manifest, null, 2)}\n` }
        ])
        return ok({ id: entry.id, path: output.path, seed, status: entry.status, cached: guarded.cached })
      }

      if (name === 'generateAssets') {
        const args = parseAssetToolArgs(name, raw) as {
          gameId: string
          assetIds?: string[]
          seed?: number
          provider?: string
        }
        const spec = await readGameSpec(deps.repoRoot, args.gameId)
        const known = new Map(spec.assets.map((requirement) => [requirement.id, requirement]))
        for (const id of args.assetIds ?? []) {
          if (!known.has(id)) {
            throw new Error(
              `Unknown asset id "${id}"; spec declares: ${[...known.keys()].join(', ')}`
            )
          }
        }
        const requirements = args.assetIds
          ? args.assetIds.map((id) => known.get(id)!)
          : spec.assets
        const composition = await readComposition(deps.repoRoot, args.gameId)
        const seed = args.seed ?? composition?.source?.seed
        if (seed === undefined) {
          throw new Error(
            'No seed: pass an explicit seed or compose the game first (composition.json source.seed)'
          )
        }
        const existingText = await readManifestText(deps.repoRoot, args.gameId)
        if (existingText) parseAssetManifest(existingText)
        const generated = args.provider
          ? await generateWithNamedProvider(deps, spec, requirements, seed, args.provider)
          : await generateGameAssets({
              requirements,
              direction: spec.direction,
              seed,
              specVersion: spec.specVersion
            })
        const uniqueGenerated = [...new Map(generated.map((asset) => [asset.entry.id, asset])).values()]
        const manifest = mergeManifest(
          existingText,
          uniqueGenerated.map((asset) => asset.entry)
        )
        await writeFiles(join(deps.repoRoot, 'games', args.gameId), [
          ...uniqueGenerated.map((asset) => ({
            path: `public/${asset.path}`,
            base64: Buffer.from(asset.bytes).toString('base64')
          })),
          { path: 'public/assets/assets.json', text: `${JSON.stringify(manifest, null, 2)}\n` }
        ])
        return ok({
          seed,
          assets: uniqueGenerated.map((asset) => ({
            id: asset.entry.id,
            path: asset.path,
            provider: asset.entry.provenance.provider,
            status: asset.entry.status
          }))
        })
      }

      const { gameId } = parseAssetToolArgs(name, raw) as { gameId: string }
      const manifestText = await readManifestText(deps.repoRoot, gameId)
      if (name === 'listAssets') {
        if (!manifestText) return ok({ missing: true, assets: [] })
        const manifest = parseAssetManifest(manifestText)
        return ok({
          formatVersion: manifest.formatVersion,
          assets: manifest.assets.map((entry) => ({
            id: entry.id,
            kind: entry.requirement.kind,
            path: entry.path,
            status: entry.status,
            provenance: entry.provenance
          }))
        })
      }

      // validateAssets
      const engine = await deps.ensureEngine(gameId)
      if (!manifestText) {
        const { hash: contentHash } = await deps.snapshotContent(gameId)
        await engine.noteContentHash(contentHash)
        await engine.runGuarded('check:assets', { contentHash }, async () => ({
          ok: true, output: { passed: false, contentHash }
        }))
        return ok({ issues: [], errorCount: 0, warningCount: 0, missing: true, passed: false, statuses: {} })
      }
      let manifest: AssetManifest
      try {
        manifest = parseAssetManifest(manifestText)
      } catch (error) {
        const issue: AssetIssue = {
          severity: 'error',
          code: 'asset-schema-invalid',
          assetId: null,
          message: `Asset manifest schema validation failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 4000)
        }
        const { hash: contentHash } = await deps.snapshotContent(gameId)
        await engine.noteContentHash(contentHash)
        await engine.runGuarded('check:assets', { contentHash }, async () => ({
          ok: true, output: { passed: false, contentHash }
        }))
        await reconcileAssetFindings(engine, [issue], hashJson({ manifestText }))
        return ok({ issues: [issue], errorCount: 1, warningCount: 0, passed: false, statuses: {} })
      }
      const composition = await readComposition(deps.repoRoot, gameId)
      const issues = validateAssetManifest(manifest, composition)
      const spec = await readGameSpecOptional(deps.repoRoot, gameId)
      const publicDir = join(deps.repoRoot, 'games', gameId, 'public')
      const evaluated = await Promise.all(manifest.assets.map(async (entry) => {
        let bytes: Uint8Array | null = null
        try {
          bytes = new Uint8Array(await readFile(join(publicDir, entry.path)))
        } catch {
          bytes = null
        }
        const recordedStyleSeed = entry.provenance.sourceParams.styleSeed
        const styleSeed = typeof recordedStyleSeed === 'number' && Number.isFinite(recordedStyleSeed)
          ? recordedStyleSeed
          : composition?.source?.seed ?? (spec ? 0 : null)
        const style = spec && styleSeed !== null ? deriveStyleParams(spec.direction, styleSeed) : null
        const entryIssues: AssetIssue[] = bytes === null
          ? [{ severity: 'error', code: 'asset-media-invalid', assetId: entry.id, message: `Asset file missing: ${entry.path}` }]
          : validateAssetMedia(entry, bytes, style)
        const status: AssetStatus = entryIssues.length > 0
          ? 'failed'
          : entry.status === 'generated' || entry.status === 'failed' ? 'validated'
          : entry.status
        return { entry: { ...entry, status }, issues: entryIssues }
      }))
      const updatedManifest = assetManifestSchema.parse({
        formatVersion: 2,
        assets: evaluated.map(({ entry }) => entry)
      })
      const statuses = Object.fromEntries(updatedManifest.assets.map((entry) => [entry.id, entry.status]))
      await writeFiles(join(deps.repoRoot, 'games', gameId), [
        { path: 'public/assets/assets.json', text: `${JSON.stringify(updatedManifest, null, 2)}\n` }
      ])
      const allIssues = [...issues, ...evaluated.flatMap(({ issues: entryIssues }) => entryIssues)]
      const errors = allIssues.filter((issue) => issue.severity === 'error')
      const passed = errors.length === 0 && updatedManifest.assets.every((entry) => entry.status === 'validated')
      const { hash: contentHash } = await deps.snapshotContent(gameId)
      await engine.noteContentHash(contentHash)
      await engine.runGuarded('check:assets', { contentHash }, async () => ({
        ok: true, output: { passed, contentHash }
      }))
      const inputHash = hashJson({ manifest: updatedManifest, composition })
      await reconcileAssetFindings(engine, errors, inputHash)
      return ok({
        issues: allIssues,
        passed,
        statuses,
        errorCount: errors.length,
        warningCount: allIssues.length - errors.length
      })
  }

  const MUTATING_TOOLS = new Set(['generateAssets', 'regenerateAsset', 'validateAssets'])
  return {
    async execute(name: string, raw: unknown): Promise<ToolResult> {
      if (!MUTATING_TOOLS.has(name)) return executeUnlocked(name, raw)
      const { gameId } = parseAssetToolArgs(name, raw) as { gameId: string }
      return serializeMutation(gameId, async () => {
        await deps.ensureEngine(gameId)
        return executeUnlocked(name, raw)
      })
    }
  }
}
