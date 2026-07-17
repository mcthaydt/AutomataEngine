import { describe, expect, it } from 'vitest'
import type { CompositionManifest } from '@automata/contracts'
import { PACK_FIXTURES, STANDARD_PACKS, resolveEditorContributions, resolveEvalHooks, resolvePacks } from '../src'

const composition = (packs: CompositionManifest['packs']): CompositionManifest =>
  ({ formatVersion: 1, gameId: 'probe', source: null, packs, assets: [] })

describe('pack registry', () => {
  it('resolves known ids in order and rejects unknown ids with the known set', () => {
    expect(resolvePacks(['interaction-inventory', 'dialogue-quests']).map((pack) => pack.id))
      .toEqual(['interaction-inventory', 'dialogue-quests'])
    expect(() => resolvePacks(['unknown-pack']))
      .toThrow(/Unknown pack id "unknown-pack".*interaction-inventory.*dialogue-quests/)
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

  it('rejects a standard pack that has no registered evaluation hook', () => {
    const id = 'missing-eval-hook'
    STANDARD_PACKS[id] = { ...STANDARD_PACKS['interaction-inventory']!, id }
    try {
      expect(() => resolveEvalHooks(composition([{ id, version: '1.0.0', config: {} }])))
        .toThrow(/Standard pack "missing-eval-hook" has no evaluation hook/)
    } finally {
      delete STANDARD_PACKS[id]
    }
  })

  it('exposes exactly the packs that exist (three, as of Phase 4 cycle 3)', () => {
    expect(Object.keys(STANDARD_PACKS)).toEqual([
      'interaction-inventory', 'dialogue-quests', 'schedules-relationships'
    ])
  })

  it('dialogue-quests fixture is deterministic, schema-valid, and references the inventory fixture items', () => {
    const first = PACK_FIXTURES['dialogue-quests']!() as { quests: Array<{ objective: { kind: string; itemIds?: string[] } }> }
    expect(PACK_FIXTURES['dialogue-quests']!()).toEqual(first)
    const inventoryItems = (PACK_FIXTURES['interaction-inventory']!() as { items: Array<{ id: string }> }).items.map((item) => item.id)
    for (const quest of first.quests) {
      if (quest.objective.kind === 'fetch') {
        for (const itemId of quest.objective.itemIds!) expect(inventoryItems).toContain(itemId)
      }
    }
  })

  it('resolves editor contributions for composed packs and skips unknown ids', () => {
    const composition = {
      formatVersion: 1 as const, gameId: 'first-light',
      source: null,
      packs: [
        { id: 'interaction-inventory', version: '1.0.0', config: { interactRadius: 1.5, items: [{ id: 'item-1', position: { x: 0, z: 0 } }], iconPath: null } },
        { id: 'not-a-pack', version: '1.0.0', config: {} }
      ],
      assets: []
    }
    const resolved = resolveEditorContributions(composition)
    expect(resolved).toHaveLength(1)
    expect(resolved[0]!.contribution.packId).toBe('interaction-inventory')
    expect(resolved[0]!.config).toEqual(composition.packs[0]!.config)
  })

  it('registers schedules-relationships with fixture, eval hook, and editor contribution', () => {
    expect(Object.keys(STANDARD_PACKS)).toContain('schedules-relationships')
    const fixture = PACK_FIXTURES['schedules-relationships']!()
    expect(fixture).toEqual(PACK_FIXTURES['schedules-relationships']!())
    const composition = {
      formatVersion: 1 as const,
      gameId: 'registry-test',
      source: null,
      packs: [{ id: 'schedules-relationships', version: '1.0.0', config: fixture as Record<string, unknown> }],
      assets: []
    }
    expect(resolveEvalHooks(composition)).toHaveLength(1)
    expect(resolveEditorContributions(composition)).toHaveLength(1)
  })
})
