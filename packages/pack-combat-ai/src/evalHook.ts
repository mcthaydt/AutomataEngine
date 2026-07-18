import type { EvalSliceView, PackEvalHook } from '@automata/game-kit'
import { COMBAT_SLICE_ID, INVENTORY_SLICE_ID, type CombatPackConfig } from './config'
import {
  combatSliceValue, createCombatState, enemiesDefeated, isWeaponHeld, stepCombat,
  type CombatState
} from './combatCore'

/** One harness tick equals one fixed simulation step for the headless combat twin. */
export const EVAL_TICK_DT = 1 / 60

interface EvalState { combat: CombatState }

const collectedView = (slices?: EvalSliceView): readonly string[] =>
  ((slices?.[INVENTORY_SLICE_ID] as { collected?: readonly string[] } | undefined)?.collected) ?? []

/**
 * Headless twin. The weapon boost reads the inventory slice from the eval
 * slice view exactly as the runtime reads the slice registry — graceful when
 * absent. Chasing a chaser converges: both close distance monotonically.
 */
export function createCombatAiEvalHook(config: CombatPackConfig): PackEvalHook {
  return {
    packId: 'combat-ai',
    createState: (): EvalState => ({ combat: createCombatState(config) }),
    nextTarget(state, player) {
      const combat = (state as EvalState).combat
      let best: { x: number; z: number } | null = null
      let bestDist = Infinity
      for (const enemy of config.enemies) {
        const entry = combat.enemies[enemy.id]!
        if (entry.hp <= 0) continue
        const dist = Math.hypot(entry.ai.position.x - player.x, entry.ai.position.z - player.z)
        if (dist < bestDist) { bestDist = dist; best = entry.ai.position }
      }
      return best ? { ...best } : null
    },
    step(state, player, slices) {
      const combat = (state as EvalState).combat
      const held = isWeaponHeld(config, collectedView(slices))
      return { combat: stepCombat(combat, player, config, EVAL_TICK_DT, held).state } satisfies EvalState
    },
    complete: (state) => enemiesDefeated((state as EvalState).combat, config),
    publishSlices: (state) => ({ [COMBAT_SLICE_ID]: combatSliceValue((state as EvalState).combat, config) })
  }
}
