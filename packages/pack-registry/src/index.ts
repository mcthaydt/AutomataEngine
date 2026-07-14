import type { CompositionManifest } from '@automata/contracts'
import type { GamePack, PackEvalHook } from '@automata/game-kit'
import {
  createInventoryEvalHook, interactionInventoryPack, packConfigSchema
} from '@automata/pack-interaction-inventory'

/**
 * The static pack registry: the only module that knows the full pack set.
 * Phase 4 packs are added to these two tables and nowhere else — game-kit
 * stays pack-agnostic and games resolve packs purely from composition data.
 */
export const STANDARD_PACKS: Record<string, GamePack> = {
  [interactionInventoryPack.id]: interactionInventoryPack as GamePack
}

const EVAL_HOOK_BUILDERS: Record<string, (config: unknown) => PackEvalHook> = {
  [interactionInventoryPack.id]: (config) => createInventoryEvalHook(packConfigSchema.parse(config))
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
    if (build) hooks.push(build(entry.config))
  }
  return hooks
}
