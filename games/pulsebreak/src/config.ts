import type { EnemyKind } from './entity'

/** Square arena: player and enemies are clamped to [-half, half] on X and Z. */
export const ARENA = { half: 13, y: 0.5 }

/** Fixed neon-overhead camera: eye + look target, set once (camera never moves). */
export const CAMERA = {
  eye: { x: 0, y: 24, z: 19 },
  look: { x: 0, y: 0, z: 0 }
}

export const PLAYER = {
  radius: 0.6,
  startHealth: 100,
  spawn: { x: 0, y: ARENA.y, z: 0 },
  /** Base upgradable stats at the start of a run. */
  baseDamage: 12,
  baseFireRate: 3,
  baseMoveSpeed: 8.5,
  projectileSpeed: 24,
  projectileRadius: 0.22,
  /** Auto-target acquisition range. */
  range: 26,
  invulnS: 0.6,
  color: '#27e0ff'
}

/** Per-pick stat increases for each upgrade kind. */
export const UPGRADE_STEP = {
  damage: 6,
  fireRate: 1,
  moveSpeed: 1.5,
  maxHealth: 25
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

export const ENEMY: Record<EnemyKind, EnemySpec> = {
  rammer: {
    health: 18, radius: 0.6, speed: 4.6, contactDamage: 10, scoreValue: 100,
    color: '#ff2e88'
  },
  shooter: {
    health: 14, radius: 0.6, speed: 3, contactDamage: 6, scoreValue: 150,
    color: '#ffd23f', cooldownS: 1.3, projectileSpeed: 13, projectileDamage: 8,
    projectileRadius: 0.3, range: 24, preferredRange: 9
  },
  boss: {
    health: 340, radius: 1.7, speed: 2.3, contactDamage: 20, scoreValue: 1000,
    color: '#b14cff', cooldownS: 1.6, projectileSpeed: 11, projectileDamage: 10,
    projectileRadius: 0.34, range: 40, burst: 10
  }
}

export interface WaveSpec { rammer: number; shooter: number; boss: number }

/** Five escalating waves; wave 5 is the lone boss. */
export const WAVES: readonly WaveSpec[] = [
  { rammer: 3, shooter: 0, boss: 0 },
  { rammer: 3, shooter: 1, boss: 0 },
  { rammer: 4, shooter: 2, boss: 0 },
  { rammer: 5, shooter: 3, boss: 0 },
  { rammer: 0, shooter: 0, boss: 1 }
]

export const WAVE_COUNT = WAVES.length

/** Enemy projectiles expire after this many seconds if they hit nothing. */
export const PROJECTILE_LIFETIME_S = 3
