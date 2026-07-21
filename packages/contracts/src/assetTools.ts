import { z } from 'zod'
import type { ToolDef } from './tools'
import { gameSlugSchema } from './workspaceTools'

/** Phase 5 tools: generate, inspect, and validate a game's asset manifest. */
export type AssetToolName = 'listAssets' | 'validateAssets' | 'generateAssets' | 'regenerateAsset'

export const assetToolArgSchemas = {
  listAssets: z.strictObject({ gameId: gameSlugSchema }),
  validateAssets: z.strictObject({ gameId: gameSlugSchema }),
  generateAssets: z.strictObject({
    gameId: gameSlugSchema,
    assetIds: z.array(z.string().min(1).max(60))
      .min(1)
      .max(80)
      .refine((assetIds) => new Set(assetIds).size === assetIds.length, {
        message: 'assetIds must not contain duplicate ids'
      })
      .meta({ uniqueItems: true })
      .optional(),
    seed: z.number().int().min(0).optional(),
    provider: z.string().min(1).max(60).optional()
  }),
  regenerateAsset: z.strictObject({
    gameId: gameSlugSchema,
    assetId: z.string().min(1).max(60),
    seed: z.number().int().min(0).optional(),
    provider: z.string().min(1).max(60).optional()
  })
} as const satisfies Record<AssetToolName, z.ZodType>

const DESCRIPTIONS: Record<AssetToolName, string> = {
  listAssets: 'List the asset manifest: id, kind, path, status, and full provenance per asset.',
  validateAssets: 'Run structural + media asset validation, flip generated to validated or failed statuses, persist findings, and record the check:assets gate step.',
  generateAssets: 'Generate spec asset requirements and write files under public/, merging manifest entries with status "generated". Procedural generation is seeded for deterministic replay. Named providers produce pinned output and may require network access and credentials; their returned bytes are preserved by content hash.',
  regenerateAsset: 'Re-run exactly one asset provider behind its stable logical id and reset it to status "generated" with fresh provenance; other assets are untouched. Procedural regeneration is seeded for deterministic replay. Named providers produce pinned output and may require network access and credentials. Follow with validateAssets.'
}

const NAMES = Object.keys(assetToolArgSchemas) as AssetToolName[]

export function assetToolDefs(): ToolDef[] {
  return NAMES.map((name) => ({ name, description: DESCRIPTIONS[name], schema: z.toJSONSchema(assetToolArgSchemas[name]) }))
}

export function parseAssetToolArgs(name: string, args: unknown): unknown {
  const schema = (assetToolArgSchemas as Record<string, z.ZodType>)[name]
  if (!schema) throw new Error(`Unknown asset tool "${name}"`)
  return schema.parse(args)
}
