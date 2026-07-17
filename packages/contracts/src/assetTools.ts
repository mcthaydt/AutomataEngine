import { z } from 'zod'
import type { ToolDef } from './tools'
import { gameSlugSchema } from './workspaceTools'

/** Phase 5 tools: generate, inspect, and validate a game's asset manifest. */
export type AssetToolName = 'listAssets' | 'validateAssets' | 'generateAssets'

export const assetToolArgSchemas = {
  listAssets: z.strictObject({ gameId: gameSlugSchema }),
  validateAssets: z.strictObject({ gameId: gameSlugSchema }),
  generateAssets: z.strictObject({
    gameId: gameSlugSchema,
    assetIds: z.array(z.string().min(1).max(60)).min(1).max(80).optional(),
    seed: z.number().int().min(0).optional()
  })
} as const satisfies Record<AssetToolName, z.ZodType>

const DESCRIPTIONS: Record<AssetToolName, string> = {
  listAssets: 'List the asset manifest: id, kind, path, status, and full provenance per asset.',
  validateAssets: 'Run structural asset validation (ids, paths, references, status rules) and persist findings.',
  generateAssets: 'Generate spec asset requirements through the procedural provider registry: writes files under public/, merges manifest entries (status "generated"). Idempotent for a given seed.'
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
