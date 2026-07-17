import type { AssetManifest } from './assetManifest'
import type { CompositionManifest } from './composition'

/**
 * Structural slice of the Phase 5 asset evaluator: pure manifest/composition
 * consistency. Media-level validation (dimensions, budgets, import success,
 * visual family, browser compatibility) arrives in cycle 3 on top of this.
 */
export interface AssetIssue {
  severity: 'error' | 'warning'
  code:
    | 'asset-duplicate-id'
    | 'asset-duplicate-path'
    | 'asset-missing'
    | 'asset-orphaned'
    | 'asset-path-mismatch'
    | 'asset-reference-missing'
    | 'asset-schema-invalid'
    | 'asset-status-invalid'
  assetId: string | null
  message: string
}

const COMPOSITION_REFERENCE = 'public/project/composition.json'

export function validateAssetManifest(manifest: AssetManifest, composition?: CompositionManifest | null): AssetIssue[] {
  const issues: AssetIssue[] = []
  const ids = new Set<string>()
  const paths = new Set<string>()
  const entriesById = new Map<string, AssetManifest['assets'][number]>()
  for (const entry of manifest.assets) {
    if (ids.has(entry.id)) {
      issues.push({ severity: 'error', code: 'asset-duplicate-id', assetId: entry.id, message: `Duplicate asset id "${entry.id}"` })
    }
    ids.add(entry.id)
    if (!entriesById.has(entry.id)) entriesById.set(entry.id, entry)
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
      const entry = entriesById.get(ref.id)
      if (!entry) {
        issues.push({ severity: 'error', code: 'asset-missing', assetId: ref.id, message: `Composition references asset "${ref.id}" missing from the manifest` })
        continue
      }
      if (entry.path !== ref.path) {
        issues.push({ severity: 'error', code: 'asset-path-mismatch', assetId: ref.id, message: `Composition path "${ref.path}" does not match manifest path "${entry.path}" for asset "${ref.id}"` })
      }
      if (!entry.references.includes(COMPOSITION_REFERENCE)) {
        issues.push({ severity: 'error', code: 'asset-reference-missing', assetId: ref.id, message: `Asset "${ref.id}" is composed but does not record "${COMPOSITION_REFERENCE}" in references` })
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
