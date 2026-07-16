import type { AssetManifest } from './assetManifest'
import type { CompositionManifest } from './composition'

/**
 * Structural slice of the Phase 5 asset evaluator: pure manifest/composition
 * consistency. Media-level validation (dimensions, budgets, import success,
 * visual family, browser compatibility) arrives in cycle 3 on top of this.
 */
export interface AssetIssue {
  severity: 'error' | 'warning'
  code: 'asset-duplicate-id' | 'asset-duplicate-path' | 'asset-missing' | 'asset-orphaned' | 'asset-status-invalid'
  assetId: string | null
  message: string
}

export function validateAssetManifest(manifest: AssetManifest, composition?: CompositionManifest | null): AssetIssue[] {
  const issues: AssetIssue[] = []
  const ids = new Set<string>()
  const paths = new Set<string>()
  for (const entry of manifest.assets) {
    if (ids.has(entry.id)) {
      issues.push({ severity: 'error', code: 'asset-duplicate-id', assetId: entry.id, message: `Duplicate asset id "${entry.id}"` })
    }
    ids.add(entry.id)
    if (paths.has(entry.path)) {
      issues.push({ severity: 'error', code: 'asset-duplicate-path', assetId: entry.id, message: `Duplicate asset path "${entry.path}"` })
    }
    paths.add(entry.path)
    if (entry.status === 'validated' && entry.provenance.provider === 'stub-generator') {
      issues.push({ severity: 'error', code: 'asset-status-invalid', assetId: entry.id, message: `Stub asset "${entry.id}" can never be 'validated' — placeholders must not ship` })
    }
  }
  if (composition) {
    for (const ref of composition.assets) {
      if (!ids.has(ref.id)) {
        issues.push({ severity: 'error', code: 'asset-missing', assetId: ref.id, message: `Composition references asset "${ref.id}" missing from the manifest` })
      }
    }
    const referenced = new Set(composition.assets.map((ref) => ref.id))
    for (const entry of manifest.assets) {
      if (!referenced.has(entry.id)) {
        issues.push({ severity: 'warning', code: 'asset-orphaned', assetId: entry.id, message: `Manifest asset "${entry.id}" is not referenced by the composition` })
      }
    }
  }
  return issues
}
