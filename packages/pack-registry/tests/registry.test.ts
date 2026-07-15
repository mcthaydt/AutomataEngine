import { describe, expect, it } from 'vitest'
import type { CompositionManifest } from '@automata/contracts'
import { STANDARD_PACKS, resolveEvalHooks, resolvePacks } from '../src'

const composition = (packs: CompositionManifest['packs']): CompositionManifest =>
  ({ formatVersion: 1, gameId: 'probe', source: null, packs, assets: [] })

describe('pack registry', () => {
  it('resolves known ids in order and rejects unknown ids with the known set', () => {
    expect(resolvePacks(['interaction-inventory']).map((pack) => pack.id)).toEqual(['interaction-inventory'])
    expect(() => resolvePacks(['dialogue-quests'])).toThrow(/Unknown pack id "dialogue-quests".*interaction-inventory/)
  })

  it('builds eval hooks from a composition, validating configs through the pack schema', () => {
    const hooks = resolveEvalHooks(composition([{
      id: 'interaction-inventory', version: '1.0.0',
      config: { interactRadius: 1.5, items: [{ id: 'item-1', position: { x: 1, z: 1 } }], iconPath: null }
    }]))
    expect(hooks).toHaveLength(1)
    expect(hooks[0]!.packId).toBe('interaction-inventory')
    expect(() => resolveEvalHooks(composition([{ id: 'interaction-inventory', version: '1.0.0', config: {} }]))).toThrow()
  })

  it('yields no hooks for an empty composition', () => {
    expect(resolveEvalHooks(composition([]))).toEqual([])
  })

  it('ignores composition entries that have no registered evaluation hook', () => {
    expect(resolveEvalHooks(composition([{
      id: 'future-pack', version: '1.0.0', config: {}
    }]))).toEqual([])
  })

  it('exposes exactly the packs that exist (one, in Phase 3)', () => {
    expect(Object.keys(STANDARD_PACKS)).toEqual(['interaction-inventory'])
  })
})
