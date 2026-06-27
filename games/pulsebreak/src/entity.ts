import type { EngineEntity, Vec3 } from '@automata/engine'

export type EnemyKind = 'rammer' | 'shooter' | 'boss'
export type Faction = 'player' | 'enemy'

/** Ranged weapon carried by shooter and boss enemies. Self-contained tuning. */
export interface EnemyWeapon {
  cooldownS: number
  remainingS: number
  projectileSpeed: number
  projectileDamage: number
  range: number
  /** Shooter kite distance: hold this gap from the player. */
  preferredRange?: number
  /** Boss radial burst: number of projectiles fired at once. */
  burst?: number
}

/** Game entity = engine mechanism components + PULSEBREAK-meaning components. */
export interface Entity extends EngineEntity {
  /** Player tag. */
  player?: true
  enemy?: { kind: EnemyKind }
  /** Kinematic velocity on the XZ plane (y unused for gameplay movers). */
  velocity?: Vec3
  collider?: { radius: number }
  /** Enemy hit points; the player's health lives in the run store slice. */
  health?: { current: number; max: number }
  contactDamage?: { amount: number }
  /** Player auto-fire cooldown tracker; damage/rate come from upgradable stats. */
  firing?: { remainingS: number }
  weapon?: EnemyWeapon
  projectile?: { faction: Faction; damage: number }
  /** Player hit invulnerability window. */
  invuln?: { remainingS: number }
  scoreValue?: number
}
