import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hashJson, type SessionEngine } from '@automata/build-session'
import {
  parseAssetToolArgs,
  parseAssetManifest,
  parseCompositionManifest,
  validateAssetManifest,
  type AssetManifest,
  type CompositionManifest,
  type ToolResult
} from '@automata/contracts'

export interface AssetToolDeps {
  repoRoot: string
  ensureEngine(gameId: string): Promise<SessionEngine>
}

const ok = (content: unknown): ToolResult => ({ ok: true, content })

async function readManifest(repoRoot: string, gameId: string): Promise<AssetManifest | null> {
  try {
    return parseAssetManifest(await readFile(join(repoRoot, 'games', gameId, 'public', 'assets', 'assets.json'), 'utf8'))
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
      const manifest = await readManifest(deps.repoRoot, gameId)
      if (name === 'listAssets') {
        if (!manifest) return ok({ missing: true, assets: [] })
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
      if (!manifest) {
        return ok({ issues: [], errorCount: 0, warningCount: 0, missing: true })
      }
      const composition = await readComposition(deps.repoRoot, gameId)
      const issues = validateAssetManifest(manifest, composition)
      const inputHash = hashJson({ manifest, composition })
      const errors = issues.filter((issue) => issue.severity === 'error')
      for (const issue of errors) {
        await engine.addFinding({
          source: 'asset',
          severity: 'error',
          code: issue.code,
          message: issue.message,
          inputHash
        })
      }
      if (errors.length === 0) await engine.autoResolve('asset')
      return ok({
        issues,
        errorCount: errors.length,
        warningCount: issues.length - errors.length
      })
    }
  }
}
