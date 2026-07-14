import { z } from 'zod'
import { assetRequirementSchema } from './gameSpec'

/**
 * Phase 3 stub of the Phase 5 asset manifest: stable logical id (= the spec's
 * assetRequirement id), the requirement it satisfies, provenance, and a
 * validation status. `placeholder` is the hook Phase 5 uses to forbid stub
 * assets in release candidates.
 */
export const assetManifestEntrySchema = z.strictObject({
  id: z.string().min(1).max(60),
  requirement: assetRequirementSchema,
  path: z.string().min(1).max(200),
  provenance: z.strictObject({
    provider: z.literal('stub-generator'),
    generator: z.string().min(1).max(60),
    specVersion: z.number().int().min(1),
    seed: z.number().int().min(0)
  }),
  validation: z.strictObject({ status: z.enum(['placeholder', 'validated']) })
})
export type AssetManifestEntry = z.infer<typeof assetManifestEntrySchema>

export const assetManifestSchema = z.strictObject({
  formatVersion: z.literal(1),
  assets: z.array(assetManifestEntrySchema).max(80)
})
export type AssetManifest = z.infer<typeof assetManifestSchema>
