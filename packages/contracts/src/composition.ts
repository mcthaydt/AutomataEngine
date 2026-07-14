import { z } from 'zod'
import { gameSlugSchema } from './workspaceTools'

/**
 * Phase 3 contract: the runtime composition manifest — the data-driven bridge
 * from an approved GameSpec to the packs the game boots. Lives as a separate
 * file `public/project/composition.json` next to (not inside) the project
 * snapshot, so no project formatVersion migration is needed and the existing
 * project reader can fetch it. `source: null` marks a plain scaffold that was
 * never composed from a spec.
 */
export const compositionPackEntrySchema = z.strictObject({
  id: z.string().min(1).max(60),
  version: z.string().min(1).max(20),
  config: z.record(z.string(), z.unknown())
})
export type CompositionPackEntry = z.infer<typeof compositionPackEntrySchema>

export const compositionManifestSchema = z.strictObject({
  formatVersion: z.literal(1),
  gameId: gameSlugSchema,
  source: z.strictObject({
    specVersion: z.number().int().min(1),
    specHash: z.string().min(1).max(128),
    seed: z.number().int().min(0)
  }).nullable(),
  packs: z.array(compositionPackEntrySchema).max(7),
  assets: z.array(z.strictObject({
    id: z.string().min(1).max(60),
    path: z.string().min(1).max(200)
  })).max(80)
})
export type CompositionManifest = z.infer<typeof compositionManifestSchema>

export function parseCompositionManifest(text: string): CompositionManifest {
  return compositionManifestSchema.parse(JSON.parse(text))
}

export function emptyComposition(gameId: string): CompositionManifest {
  return { formatVersion: 1, gameId, source: null, packs: [], assets: [] }
}
