import { z } from 'zod'
import { assetRequirementSchema } from './gameSpec'

/**
 * Phase 5 asset manifest v2: the normalized, versioned record behind every
 * asset. Stable logical id (= the spec's assetRequirement id) — everything
 * regenerates behind it. Provenance carries the determinism mode from day
 * one: 'seeded' (recomputable from seed+params) for procedural providers,
 * 'pinned' (reproduced by content hash) for future AI providers. `status`
 * gates the release: anything not 'validated' hard-fails the release gate,
 * which is how "fallbacks never ship" is a data rule rather than policy.
 */
export const assetDeterminismSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('seeded') }),
  z.strictObject({ kind: z.literal('pinned'), contentHash: z.string().min(1).max(128) })
])
export type AssetDeterminism = z.infer<typeof assetDeterminismSchema>

export const assetLicenseSchema = z.strictObject({
  kind: z.enum(['generated', 'licensed', 'public-domain']),
  notes: z.string().max(400)
})

export const assetProvenanceSchema = z.strictObject({
  provider: z.string().min(1).max(60),
  providerVersion: z.string().min(1).max(20),
  generator: z.string().min(1).max(60),
  sourceParams: z.record(z.string(), z.unknown()),
  seed: z.number().int().min(0),
  specVersion: z.number().int().min(1),
  determinism: assetDeterminismSchema,
  license: assetLicenseSchema
})
export type AssetProvenance = z.infer<typeof assetProvenanceSchema>

export const assetTransformationSchema = z.strictObject({
  tool: z.string().min(1).max(60),
  toolVersion: z.string().min(1).max(20),
  params: z.record(z.string(), z.unknown())
})

/** Only the asset evaluator sets 'validated'; providers emit 'generated' or 'placeholder'. */
export const assetStatusSchema = z.enum(['placeholder', 'generated', 'validated', 'failed'])
export type AssetStatus = z.infer<typeof assetStatusSchema>

export const assetManifestEntrySchema = z.strictObject({
  id: z.string().min(1).max(60),
  requirement: assetRequirementSchema,
  path: z.string().min(1).max(200),
  provenance: assetProvenanceSchema,
  transformations: z.array(assetTransformationSchema).max(20),
  status: assetStatusSchema,
  references: z.array(z.string().min(1).max(200)).max(40)
})
export type AssetManifestEntry = z.infer<typeof assetManifestEntrySchema>

export const assetManifestSchema = z.strictObject({
  formatVersion: z.literal(2),
  assets: z.array(assetManifestEntrySchema).max(80)
})
export type AssetManifest = z.infer<typeof assetManifestSchema>

/** The Phase 3 stub shape, kept only as the migration source. */
const legacyEntrySchema = z.strictObject({
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
const legacyManifestSchema = z.strictObject({
  formatVersion: z.literal(1),
  assets: z.array(legacyEntrySchema).max(80)
})
export type LegacyAssetManifest = z.infer<typeof legacyManifestSchema>

export function migrateAssetManifest(legacy: LegacyAssetManifest): AssetManifest {
  return {
    formatVersion: 2,
    assets: legacy.assets.map((entry) => ({
      id: entry.id,
      requirement: entry.requirement,
      path: entry.path,
      provenance: {
        provider: entry.provenance.provider,
        providerVersion: '1.0.0',
        generator: entry.provenance.generator,
        sourceParams: {},
        seed: entry.provenance.seed,
        specVersion: entry.provenance.specVersion,
        determinism: { kind: 'seeded' },
        license: { kind: 'generated', notes: 'Procedurally generated placeholder.' }
      },
      transformations: [],
      status: entry.validation.status === 'validated' ? 'validated' : 'placeholder',
      references: ['public/project/composition.json']
    }))
  }
}

/** Single parse entry: v1 migrates, v2 validates, anything else is an error. */
export function parseAssetManifest(text: string): AssetManifest {
  const raw = JSON.parse(text) as { formatVersion?: unknown }
  if (raw.formatVersion === 1) return migrateAssetManifest(legacyManifestSchema.parse(raw))
  if (raw.formatVersion === 2) return assetManifestSchema.parse(raw)
  throw new Error(`Unsupported asset manifest formatVersion: ${String(raw.formatVersion)}`)
}
