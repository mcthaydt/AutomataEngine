import { describe, expect, it } from 'vitest'
import type { CompositionManifest } from '@automata/contracts'
import { PACK_FIXTURES } from '@automata/pack-registry'
import { createTemplate } from '../../src/project/template'
import { evaluateProject } from '../../src/project/evaluation'

describe('evaluateProject cross-pack slices', () => {
  it('completes an inventory + dialogue composition headlessly (fetch unblocks via slices)', async () => {
    const snapshot = createTemplate()
    const composition: CompositionManifest = {
      formatVersion: 1,
      gameId: snapshot.manifest.gameId,
      source: null,
      packs: [
        { id: 'interaction-inventory', version: '1.0.0', config: PACK_FIXTURES['interaction-inventory']!() as Record<string, unknown> },
        { id: 'dialogue-quests', version: '1.0.0', config: PACK_FIXTURES['dialogue-quests']!() as Record<string, unknown> }
      ],
      assets: []
    }
    const result = await evaluateProject(snapshot, { maxSteps: 20_000 }, composition)
    expect(result.metrics.objectivesComplete).toBe(true)
  })
})
