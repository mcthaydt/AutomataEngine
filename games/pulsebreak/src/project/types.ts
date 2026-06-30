import type { Vec3 } from '@automata/engine'
import type { EnemyKind } from '../entity'
import type { UpgradeDef, UpgradeId } from '../sim/upgrades'

/** Stable type ids for Pulsebreak's authoring components and resources. */
export const PULSEBREAK_TYPE_IDS = {
  playerStart: 'pulsebreak.player-start',
  spawnZone: 'pulsebreak.spawn-zone',
  tuning: 'pulsebreak.tuning',
  enemyTypes: 'pulsebreak.enemy-types',
  waveSet: 'pulsebreak.wave-set',
  upgradeSet: 'pulsebreak.upgrade-set'
} as const

/**
 * Project-owned compiled types for Pulsebreak.
 *
 * These are owned by the project layer, the single source of authored gameplay
 * tuning shared by browser and headless runtimes.
 */
export interface PlayerSpec {
  radius: number
  startHealth: number
  baseDamage: number
  baseFireRate: number
  baseMoveSpeed: number
  projectileSpeed: number
  projectileRadius: number
  range: number
  invulnS: number
  color: string
}

export interface EnemySpec {
  health: number
  radius: number
  speed: number
  contactDamage: number
  scoreValue: number
  color: string
  cooldownS?: number
  projectileSpeed?: number
  projectileDamage?: number
  projectileRadius?: number
  range?: number
  preferredRange?: number
  burst?: number
}

export interface WaveSpec {
  rammer: number
  shooter: number
  boss: number
}

/** A weighted enemy spawn region resolved from a scene `pulsebreak.spawn-zone`. */
export interface SpawnZone {
  id: string
  mode: 'ring' | 'point'
  center: Vec3
  radius: number
  weight: number
  enemyTypeIds: EnemyKind[]
  minSeparation: number
  edgePaddingMin: number
  edgePaddingMax: number
  angleJitterRad: number
}

export interface PulsebreakCompiledProject {
  projectId: string
  sceneId: string
  arena: { half: number; y: number }
  camera: { eye: Vec3; look: Vec3 }
  player: PlayerSpec & { spawn: Vec3 }
  enemy: Record<EnemyKind, EnemySpec>
  waves: WaveSpec[]
  upgrades: Record<UpgradeId, UpgradeDef>
  upgradeStep: Record<UpgradeId, number>
  projectileLifetimeS: number
  floor: { position: Vec3; size: Vec3; color: string }
  spawnZones: SpawnZone[]
}
