import { describe, expect, it } from 'vitest'
import { deriveStyleParams, sha256Hex, validateAssetMedia } from '@automata/asset-providers'
import type { AssetManifestEntry, AssetRequirement } from '@automata/contracts'
import { createClaudeSvgProvider } from '../src/claudeSvgProvider'

/**
 * Live smoke: proves the real network path (auth, request shape, SVG
 * extraction, pinned hash). Runs only when ANTHROPIC_API_KEY is set —
 * npm run ci stays offline-deterministic without it.
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('claude-svg live smoke', () => {
  it('generates a well-formed, hash-pinned ui icon', { timeout: 120_000 }, async () => {
    const provider = createClaudeSvgProvider()
    const style = deriveStyleParams({ visualStyle: 'warm lantern-lit dusk', audioStyle: 'calm' }, 42)
    const requirement: AssetRequirement = { id: 'live-icon', kind: 'ui', description: 'A small lantern icon.' }
    const { bytes, provenance } = await provider.generate(requirement, { seed: 7, style, specVersion: 1 })

    const text = new TextDecoder().decode(bytes)
    expect(text.trimStart().startsWith('<svg')).toBe(true)
    expect(provenance.determinism).toEqual({ kind: 'pinned', contentHash: sha256Hex(bytes) })

    // Full media validation may fail on palette compliance — that is the
    // pipeline's gate doing its job, not a smoke failure. Assert only the
    // structural half here and log the rest for observability.
    const entry: AssetManifestEntry = {
      id: requirement.id, requirement, path: 'assets/live-icon.svg',
      provenance, transformations: [], status: 'generated',
      references: ['public/project/composition.json']
    }
    const issues = validateAssetMedia(entry, bytes, style)
    expect(issues.filter((issue) => issue.code === 'asset-hash-mismatch')).toEqual([])
    expect(issues.filter((issue) => issue.code === 'asset-media-invalid' && issue.message.includes('does not parse'))).toEqual([])
    if (issues.length > 0) console.warn('live smoke: non-structural findings', issues)
  })
})
