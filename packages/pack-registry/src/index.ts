import type { CompositionManifest } from '@automata/contracts'
import type { GamePack, PackEditorContribution, PackEvalHook } from '@automata/game-kit'
import {
  createInventoryEvalHook, interactionInventoryPack, inventoryEditorContribution, packConfigSchema
} from '@automata/pack-interaction-inventory'

/**
 * The static pack registry: the only module that knows the full pack set.
 * Phase 4 packs are added to these two tables and nowhere else — game-kit
 * stays pack-agnostic and games resolve packs purely from composition data.
 */
export const STANDARD_PACKS: Record<string, GamePack> = {
  [interactionInventoryPack.id]: interactionInventoryPack as GamePack
}

/**
 * Deterministic fixture config per pack, for the composition-matrix harness.
 * Every pack registered in STANDARD_PACKS MUST have a fixture here; the
 * matrix test enforces that.
 */
export const PACK_FIXTURES: Record<string, () => unknown> = {
  [interactionInventoryPack.id]: () => ({
    interactRadius: 1.5,
    items: [
      { id: 'item-1', position: { x: -2, z: 3 } },
      { id: 'item-2', position: { x: 4, z: -1 } }
    ],
    iconPath: null
  })
}

const EVAL_HOOK_BUILDERS: Record<string, (config: unknown) => PackEvalHook> = {
  [interactionInventoryPack.id]: (config) => createInventoryEvalHook(packConfigSchema.parse(config))
}

const EDITOR_CONTRIBUTIONS: Record<string, PackEditorContribution> = {
  [inventoryEditorContribution.packId]: inventoryEditorContribution
}

export function resolvePacks(ids: readonly string[]): GamePack[] {
  return ids.map((id) => {
    const pack = STANDARD_PACKS[id]
    if (!pack) throw new Error(`Unknown pack id "${id}"; known packs: ${Object.keys(STANDARD_PACKS).join(', ')}`)
    return pack
  })
}

export function resolveEvalHooks(composition: CompositionManifest): PackEvalHook[] {
  const hooks: PackEvalHook[] = []
  for (const entry of composition.packs) {
    const build = EVAL_HOOK_BUILDERS[entry.id]
    if (!build) {
      if (STANDARD_PACKS[entry.id]) {
        throw new Error(`Standard pack "${entry.id}" has no evaluation hook`)
      }
      continue
    }
    hooks.push(build(entry.config))
  }
  return hooks
}

/** Editor contributions + configs for the packs a composition selects. */
export function resolveEditorContributions(
  composition: CompositionManifest
): Array<{ contribution: PackEditorContribution; config: unknown }> {
  return composition.packs.flatMap((entry) => {
    const contribution = EDITOR_CONTRIBUTIONS[entry.id]
    return contribution ? [{ contribution, config: entry.config }] : []
  })
}
