import type { AssetManifestEntry, AssetProvider, AssetRequirement, StyleParams } from '@automata/contracts'
import { hashStringToSeed } from '@automata/engine'
import { resolveProvider } from './registry'
import { deriveStyleParams } from './styleParams'
import { optimizeAssetBytes } from './optimize'
import { sha256Hex } from './hash'

export interface GenerateAssetsInput {
  requirements: readonly AssetRequirement[]
  direction: { visualStyle: string; audioStyle: string }
  seed: number
  specVersion: number
}

export interface GeneratedAsset {
  entry: AssetManifestEntry
  path: string
  bytes: Uint8Array
}

export interface BuildAssetInput {
  seed: number
  style: StyleParams
  styleSeed?: number
  specVersion: number
}

/**
 * One requirement through one provider: generate, optimize, build the entry.
 * Pinned contentHash always covers the FINAL written bytes — optimization can
 * rewrite provider output, so a provider-computed hash is recomputed here.
 */
export async function buildGeneratedAsset(
  requirement: AssetRequirement,
  provider: AssetProvider,
  input: BuildAssetInput
): Promise<GeneratedAsset> {
  const { bytes, provenance } = await provider.generate(requirement, {
    seed: input.seed,
    style: input.style,
    specVersion: input.specVersion
  })
  const optimized = optimizeAssetBytes(requirement.kind, bytes)
  const finalBytes = optimized?.bytes ?? bytes
  const transformations = optimized ? [optimized.transformation] : []
  const attributedProvenance = input.styleSeed === undefined
    ? provenance
    : { ...provenance, sourceParams: { ...provenance.sourceParams, styleSeed: input.styleSeed } }
  const finalProvenance = attributedProvenance.determinism.kind === 'pinned'
    ? { ...attributedProvenance, determinism: { kind: 'pinned' as const, contentHash: sha256Hex(finalBytes) } }
    : attributedProvenance
  const path = `assets/${requirement.id}.${provider.fileExtension(requirement)}`
  return {
    path,
    bytes: finalBytes,
    entry: {
      id: requirement.id,
      requirement,
      path,
      provenance: finalProvenance,
      transformations,
      status: 'generated',
      references: []
    }
  }
}

/**
 * Pure orchestration with no filesystem access. Each provider receives a
 * child seed derived from the game seed and asset id, so adding, removing,
 * or regenerating one requirement cannot perturb any other byte stream.
 */
export async function generateGameAssets(
  input: GenerateAssetsInput
): Promise<GeneratedAsset[]> {
  const style = deriveStyleParams(input.direction, input.seed)
  const generated: GeneratedAsset[] = []
  for (const requirement of input.requirements) {
    const provider = resolveProvider(requirement.kind)
    const childSeed = hashStringToSeed(`${input.seed}:${requirement.id}`)
    generated.push(await buildGeneratedAsset(requirement, provider, {
      seed: childSeed,
      style,
      specVersion: input.specVersion
    }))
  }
  return generated
}
