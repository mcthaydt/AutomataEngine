import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hashJson, type SessionEngine } from '@automata/build-session'
import {
  parseAssetToolArgs,
  parseAssetManifest,
  parseCompositionManifest,
  validateAssetManifest,
  type AssetManifest,
  type AssetIssue,
  type CompositionManifest,
  type ToolResult
} from '@automata/contracts'

export interface AssetToolDeps {
  repoRoot: string
  ensureEngine(gameId: string): Promise<SessionEngine>
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

export function createAssetToolRunner(deps: AssetToolDeps) {
  return {
    async execute(name: string, raw: unknown): Promise<ToolResult> {
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
        return ok({ issues: [], errorCount: 0, warningCount: 0, missing: true })
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
        await reconcileAssetFindings(engine, [issue], hashJson({ manifestText }))
        return ok({ issues: [issue], errorCount: 1, warningCount: 0 })
      }
      const composition = await readComposition(deps.repoRoot, gameId)
      const issues = validateAssetManifest(manifest, composition)
      const inputHash = hashJson({ manifest, composition })
      const errors = issues.filter((issue) => issue.severity === 'error')
      await reconcileAssetFindings(engine, errors, inputHash)
      return ok({
        issues,
        errorCount: errors.length,
        warningCount: issues.length - errors.length
      })
    }
  }
}
