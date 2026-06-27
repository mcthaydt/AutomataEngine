import type { Rng } from './rng'

export type UpgradeId = 'damage' | 'fireRate' | 'moveSpeed' | 'maxHealth'

export interface UpgradeDef {
  id: UpgradeId
  label: string
  description: string
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  damage: { id: 'damage', label: 'Overcharge', description: '+ pulse damage' },
  fireRate: { id: 'fireRate', label: 'Rapid Pulse', description: '+ fire rate' },
  moveSpeed: { id: 'moveSpeed', label: 'Thrusters', description: '+ move speed' },
  maxHealth: { id: 'maxHealth', label: 'Reinforce', description: '+ max integrity & heal' }
}

export const UPGRADE_IDS: readonly UpgradeId[] = ['damage', 'fireRate', 'moveSpeed', 'maxHealth']

/** Deterministically offers `count` distinct upgrades from the run's rng. */
export function chooseUpgrades(rng: Rng, count = 3): UpgradeId[] {
  return rng.shuffle(UPGRADE_IDS).slice(0, count)
}
