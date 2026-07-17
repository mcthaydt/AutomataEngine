import { describe, expect, it } from 'vitest'
import { compositionManifestSchema, assetManifestSchema, gameSpecSchema, minimalGameSpecDraft, type GameSpec } from '@automata/contracts'
import { validatePackSet } from '@automata/game-kit'
import { interactionInventoryPack } from '@automata/pack-interaction-inventory'
import { composeGame } from '../src'

function sliceSpec(): GameSpec {
  const draft = minimalGameSpecDraft('first-light') as Record<string, unknown>
  draft.capabilities = [{ id: 'interaction-inventory', config: { requiredItems: 2, interactRadius: 1.5 }, requirements: [] }]
  draft.assets = [{ id: 'item-icon', kind: 'ui', description: 'Light-cell icon for the inventory HUD' }]
  ;(draft.identity as Record<string, unknown>).id = 'first-light'
  return gameSpecSchema.parse({
    specVersion: 1,
    provenance: { prompt: 'test', translations: [], history: [{ version: 1, reason: 'initial compile' }] },
    ...draft
  })
}

function specWithCapabilities(capabilities: GameSpec['capabilities']): GameSpec {
  const spec = sliceSpec()
  return gameSpecSchema.parse({
    ...spec,
    capabilities,
    cast: [
      ...spec.cast,
      { id: 'keeper', name: 'The Keeper', role: 'quest-giver', description: 'Keeper of the beacon.' }
    ]
  })
}

describe('composeGame', () => {
  it('the composed pack set passes contract-v2 validation with no issues', () => {
    expect(validatePackSet([interactionInventoryPack])).toEqual([])
  })

  it('is byte-deterministic for the same (spec, seed) and differs across seeds', () => {
    const spec = sliceSpec()
    const a = composeGame({ spec, seed: 7, specHash: 'h1' })
    const b = composeGame({ spec, seed: 7, specHash: 'h1' })
    const c = composeGame({ spec, seed: 8, specHash: 'h1' })
    expect(a).toEqual(b)
    if (!a.ok || !c.ok) throw new Error('expected ok results')
    expect(a.files).not.toEqual(c.files)
  })

  it('emits schema-valid composition and asset manifests wired to the spec', () => {
    const result = composeGame({ spec: sliceSpec(), seed: 7, specHash: 'h1' })
    if (!result.ok) throw new Error('expected ok')
    expect(compositionManifestSchema.parse(result.composition)).toEqual(result.composition)
    expect(assetManifestSchema.parse(result.assetManifest)).toEqual(result.assetManifest)
    expect(result.composition.source).toEqual({ specVersion: 1, specHash: 'h1', seed: 7 })
    expect(result.composition.packs.map((entry) => entry.id)).toEqual(['interaction-inventory'])
    const config = result.composition.packs[0]!.config as { items: unknown[]; iconPath: string }
    expect(config.items).toHaveLength(2)
    expect(config.iconPath).toBe('assets/item-icon.svg')
    expect(result.composition.assets).toEqual([{ id: 'item-icon', path: 'assets/item-icon.svg' }])
    expect(result.assetManifest.assets[0]!.provenance).toMatchObject({
      provider: 'stub-generator',
      providerVersion: '1.0.0',
      generator: 'svg-icon@1',
      sourceParams: {},
      specVersion: 1,
      seed: 7,
      determinism: { kind: 'seeded' },
      license: { kind: 'generated' }
    })
    expect(result.summary).toEqual({ packIds: ['interaction-inventory'], itemCount: 2, assetIds: ['item-icon'] })
  })

  it('emits a v2 asset manifest with seeded stub provenance', () => {
    const result = composeGame({ spec: sliceSpec(), seed: 7, specHash: 'h1' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.assetManifest.formatVersion).toBe(2)
    const entry = result.assetManifest.assets[0]!
    expect(entry.status).toBe('placeholder')
    expect(entry.provenance.determinism).toEqual({ kind: 'seeded' })
    expect(entry.provenance.license.kind).toBe('generated')
    expect(entry.transformations).toEqual([])
    expect(entry.references).toEqual(['public/project/composition.json'])
  })

  it('emits the file set with stable serialization and a seeded in-bounds goal', () => {
    const result = composeGame({ spec: sliceSpec(), seed: 7, specHash: 'h1' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.files.map((file) => file.path)).toEqual([
      'public/project/resources/tuning.resource.json',
      'public/project/composition.json',
      'public/assets/item-icon.svg',
      'public/assets/assets.json'
    ])
    for (const file of result.files.filter((entry) => entry.path.endsWith('.json'))) {
      expect(file.text.endsWith('\n')).toBe(true)
      expect(file.text).toBe(`${JSON.stringify(JSON.parse(file.text), null, 2)}\n`)
    }
    const tuning = JSON.parse(result.files[0]!.text) as { id: string; typeId: string; data: { goal: { x: number; z: number }; arenaHalf: number } }
    expect(tuning.id).toBe('tuning')
    expect(tuning.typeId).toBe('first-light.tuning')
    expect(Math.abs(tuning.data.goal.x)).toBeLessThanOrEqual(tuning.data.arenaHalf)
    expect(Math.abs(tuning.data.goal.z)).toBeLessThanOrEqual(tuning.data.arenaHalf)
    expect(result.files[2]!.text).toContain('<svg')
  })

  it('rejects capabilities beyond the Phase 3 slice with a typed issue', () => {
    const spec = sliceSpec()
    const withExtra = {
      ...spec,
      capabilities: [...spec.capabilities, { id: 'save-load' as const, config: {}, requirements: [] }]
    }
    const result = composeGame({ spec: withExtra as GameSpec, seed: 7, specHash: 'h1' })
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'compose-unsupported-capability' }] })
  })

  it('composes without an icon when the spec has no UI asset requirement', () => {
    const spec = { ...sliceSpec(), assets: [] }
    const result = composeGame({ spec, seed: 7, specHash: 'h1' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.assetManifest.assets).toEqual([])
    expect(result.composition.packs[0]!.config).toMatchObject({ iconPath: null })
    expect(result.files.some((file) => file.path.endsWith('.svg'))).toBe(false)
  })

  it('composes inventory + dialogue-quests with ordered sections', () => {
    const spec = specWithCapabilities([
      { id: 'interaction-inventory', config: {}, requirements: [] },
      { id: 'dialogue-quests', config: {}, requirements: [] }
    ])
    const result = composeGame({ spec, seed: 11, specHash: 'h' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.composition.packs.map((entry) => entry.id)).toEqual(['interaction-inventory', 'dialogue-quests'])
    const dialogueConfig = result.composition.packs[1]!.config as { quests: Array<{ objective: { kind: string; itemIds?: string[] } }> }
    const itemIds = (result.composition.packs[0]!.config as { items: Array<{ id: string }> }).items.map((item) => item.id)
    for (const quest of dialogueConfig.quests) {
      if (quest.objective.kind === 'fetch') {
        for (const id of quest.objective.itemIds!) expect(itemIds).toContain(id)
      }
    }
  })

  it('inventory-only output is byte-identical to the pre-dialogue compose (first-light freeze)', () => {
    const spec = specWithCapabilities([{ id: 'interaction-inventory', config: {}, requirements: [] }])
    const result = composeGame({ spec, seed: 11, specHash: 'h' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files).toMatchSnapshot()
  })

  it('still rejects capabilities without a composed pack', () => {
    const spec = specWithCapabilities([
      { id: 'interaction-inventory', config: {}, requirements: [] },
      { id: 'combat-ai', config: {}, requirements: [] }
    ])
    const result = composeGame({ spec, seed: 11, specHash: 'h' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues[0]!.code).toBe('compose-unsupported-capability')
  })
})
