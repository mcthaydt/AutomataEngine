import { z } from 'zod'
import type { ToolDef } from './tools'
import { gameSlugSchema } from './workspaceTools'

/** Phase 5 tools: inspect and structurally validate a game's asset manifest. */
export type AssetToolName = 'listAssets' | 'validateAssets'

export const assetToolArgSchemas = {
  listAssets: z.strictObject({ gameId: gameSlugSchema }),
  validateAssets: z.strictObject({ gameId: gameSlugSchema })
} as const satisfies Record<AssetToolName, z.ZodType>

const DESCRIPTIONS: Record<AssetToolName, string> = {
  listAssets: 'List the asset manifest: id, kind, path, status, and full provenance per asset.',
  validateAssets: 'Run structural asset validation (ids, paths, references, status rules) and persist findings.'
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
