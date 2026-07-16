import { describe, expect, it } from 'vitest'
import { parseAssetManifest } from '../src/assetManifest'
import { validateAssetManifest } from '../src/assetValidation'
import { findingSourceSchema } from '../src/session'

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-icon',
  requirement: { id: 'item-icon', kind: 'ui', description: 'Icon.' },
  path: 'assets/item-icon.svg',
  provenance: {
    provider: 'stub-generator', providerVersion: '1.0.0', generator: 'svg-icon@1',
    sourceParams: {}, seed: 1, specVersion: 1,
    determinism: { kind: 'seeded' }, license: { kind: 'generated', notes: '' }
  },
  transformations: [],
  status: 'placeholder',
  references: ['public/project/composition.json'],
  ...overrides
})
const manifest = (assets: unknown[]) => parseAssetManifest(JSON.stringify({ formatVersion: 2, assets }))
const composition = (assets: Array<{ id: string; path: string }>) => ({
  formatVersion: 1 as const, gameId: 'first-light', source: null, packs: [], assets
})

describe('validateAssetManifest (structural slice of the asset evaluator)', () => {
  it('passes a consistent manifest + composition', () => {
    const issues = validateAssetManifest(
      manifest([entry()]),
      composition([{ id: 'item-icon', path: 'assets/item-icon.svg' }])
    )
    expect(issues).toEqual([])
  })

  it('flags duplicate ids and duplicate paths as errors', () => {
    const issues = validateAssetManifest(manifest([entry(), entry()]), null)
    const codes = issues.map((issue) => issue.code).sort()
    expect(codes).toEqual(['asset-duplicate-id', 'asset-duplicate-path'])
    expect(issues.every((issue) => issue.severity === 'error')).toBe(true)
  })

  it('flags composition assets missing from the manifest as errors', () => {
    const issues = validateAssetManifest(manifest([]), composition([{ id: 'item-icon', path: 'assets/item-icon.svg' }]))
    expect(issues).toEqual([expect.objectContaining({ code: 'asset-missing', severity: 'error', assetId: 'item-icon' })])
  })

  it('flags manifest assets absent from the composition as warnings', () => {
    const issues = validateAssetManifest(manifest([entry()]), composition([]))
    expect(issues).toEqual([expect.objectContaining({ code: 'asset-orphaned', severity: 'warning', assetId: 'item-icon' })])
  })

  it('flags a stub-generator asset claiming validated status as an error', () => {
    const issues = validateAssetManifest(manifest([entry({ status: 'validated' })]), null)
    expect(issues).toEqual([expect.objectContaining({ code: 'asset-status-invalid', severity: 'error', assetId: 'item-icon' })])
  })

  it("the findings surface accepts the 'asset' source", () => {
    expect(findingSourceSchema.parse('asset')).toBe('asset')
  })
})
