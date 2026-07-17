import type { AssetManifestEntry, AssetRequirement } from '@automata/contracts'
import { hashStringToSeed } from '@automata/engine'
import { resolveProvider } from './registry'
import { deriveStyleParams } from './styleParams'
import { optimizeAssetBytes } from './optimize'

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
    const { bytes, provenance } = await provider.generate(requirement, {
      seed: childSeed,
      style,
      specVersion: input.specVersion
    })
    const optimized = optimizeAssetBytes(requirement.kind, bytes)
    const finalBytes = optimized?.bytes ?? bytes
    const transformations = optimized ? [optimized.transformation] : []
    const path = `assets/${requirement.id}.${provider.fileExtension(requirement)}`
    generated.push({
      path,
      bytes: finalBytes,
      entry: {
        id: requirement.id,
        requirement,
        path,
        provenance,
        transformations,
        status: 'generated',
        references: []
      }
    })
  }
  return generated
}
