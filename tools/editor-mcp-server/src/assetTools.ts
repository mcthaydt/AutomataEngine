import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { deriveStyleParams, generateGameAssets, validateAssetMedia } from '@automata/asset-providers'
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
  type ToolResult
} from '@automata/contracts'

export interface AssetToolDeps {
  repoRoot: string
  ensureEngine(gameId: string): Promise<SessionEngine>
  snapshotContent(gameId: string): Promise<{ hash: string }>
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
  return assetManifestSchema.parse({
    formatVersion: 2,
    assets: [
      ...existing.assets.filter((entry) => !generatedById.has(entry.id)),
      ...generatedById.values()
    ]
  })
}

export function createAssetToolRunner(deps: AssetToolDeps) {
  return {
    async execute(name: string, raw: unknown): Promise<ToolResult> {
      if (name === 'generateAssets') {
        const args = parseAssetToolArgs(name, raw) as {
          gameId: string
          assetIds?: string[]
          seed?: number
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
        const generated = await generateGameAssets({
          requirements,
          direction: spec.direction,
          seed,
          specVersion: spec.specVersion
        })
        const publicDir = join(deps.repoRoot, 'games', args.gameId, 'public')
        for (const asset of generated) {
          const filePath = join(publicDir, asset.path)
          await mkdir(dirname(filePath), { recursive: true })
          await writeFile(filePath, asset.bytes)
        }
        const manifest = mergeManifest(
          await readManifestText(deps.repoRoot, args.gameId),
          generated.map((asset) => asset.entry)
        )
        await mkdir(join(publicDir, 'assets'), { recursive: true })
        await writeFile(
          join(publicDir, 'assets', 'assets.json'),
          `${JSON.stringify(manifest, null, 2)}\n`
        )
        return ok({
          seed,
          assets: generated.map((asset) => ({
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
        await engine.runGuarded('check:assets', { contentHash }, async () => ({
          ok: true, output: { passed: false, contentHash }
        }))
        await reconcileAssetFindings(engine, [issue], hashJson({ manifestText }))
        return ok({ issues: [issue], errorCount: 1, warningCount: 0, passed: false, statuses: {} })
      }
      const composition = await readComposition(deps.repoRoot, gameId)
      const issues = validateAssetManifest(manifest, composition)
      const spec = await readGameSpecOptional(deps.repoRoot, gameId)
      const style = spec ? deriveStyleParams(spec.direction, composition?.source?.seed ?? 0) : null
      const publicDir = join(deps.repoRoot, 'games', gameId, 'public')
      const evaluated = await Promise.all(manifest.assets.map(async (entry) => {
        let bytes: Uint8Array | null = null
        try {
          bytes = new Uint8Array(await readFile(join(publicDir, entry.path)))
        } catch {
          bytes = null
        }
        const entryIssues: AssetIssue[] = bytes === null
          ? [{ severity: 'error', code: 'asset-media-invalid', assetId: entry.id, message: `Asset file missing: ${entry.path}` }]
          : style ? validateAssetMedia(entry, bytes, style) : []
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
      await writeFile(
        join(publicDir, 'assets', 'assets.json'),
        `${JSON.stringify(updatedManifest, null, 2)}\n`
      )
      const allIssues = [...issues, ...evaluated.flatMap(({ issues: entryIssues }) => entryIssues)]
      const errors = allIssues.filter((issue) => issue.severity === 'error')
      const passed = errors.length === 0 && updatedManifest.assets.every((entry) => entry.status === 'validated')
      const { hash: contentHash } = await deps.snapshotContent(gameId)
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
  }
}
