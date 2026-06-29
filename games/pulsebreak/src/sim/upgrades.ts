import type { Rng } from './rng'

export type UpgradeId = 'damage' | 'fireRate' | 'moveSpeed' | 'maxHealth'

export interface UpgradeDef {
  id: UpgradeId
  label: string
  description: string
}

/** Deterministically offers `count` distinct upgrades from the run's rng. */
export function chooseUpgrades(rng: Rng, ids: readonly UpgradeId[], count = 3): UpgradeId[] {
  return rng.shuffle(ids).slice(0, count)
}
