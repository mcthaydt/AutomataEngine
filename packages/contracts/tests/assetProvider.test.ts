import { describe, expect, it } from 'vitest'
import type { AssetKind, AssetProvider, ProviderContext, StyleParams } from '../src/assetProvider'

const style: StyleParams = {
  palette: { baseHue: 210, accentHues: [30, 300], saturation: 0.7, lightness: 0.55 },
  audio: { waveform: 'sine', tempo: 'slow' }
}

/** Compile-level contract check: a literal provider satisfies the interface. */
const stub: AssetProvider = {
  id: 'stub',
  version: '1.0.0',
  kinds: ['ui'] as const satisfies readonly AssetKind[],
  fileExtension: () => 'svg',
  generate: async (requirement, ctx: ProviderContext) => ({
    bytes: new Uint8Array([60]),
    provenance: {
      provider: 'stub',
      providerVersion: '1.0.0',
      generator: 'stub@1',
      sourceParams: {},
      seed: ctx.seed,
      specVersion: ctx.specVersion,
      determinism: { kind: 'seeded' },
      license: { kind: 'generated', notes: '' }
    }
  })
}

describe('asset provider contract', () => {
  it('a minimal provider literal type-checks and runs', async () => {
    const result = await stub.generate(
      { id: 'x', kind: 'ui', description: 'd' },
      { seed: 1, style, specVersion: 1 }
    )
    expect(result.provenance.seed).toBe(1)
    expect(result.bytes).toBeInstanceOf(Uint8Array)
  })
})
