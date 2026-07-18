import type { SeededRng } from '@automata/engine'
import { packConfigSchema, type CombatPackConfig, type EnemyDef } from './config'

export const COMBAT_DEFAULTS = {
  player: { maxHealth: 5, attackDamage: 1, attackRadius: 1.5, attackCooldownSeconds: 0.5, secondWindSeconds: 2 },
  enemy: { maxHealth: 3, attackDamage: 1, attackRadius: 1.2, attackCooldownSeconds: 0.8, speed: 3, aggroRadius: 4, leashRadius: 7 },
  weaponDamageMultiplier: 2
} as const

export interface CombatComposeInput {
  specConfig: { playerMaxHealth?: number }
  cast: ReadonlyArray<{ id: string; name: string; role: string }>
  arena: { half: number; spawn: { x: number; z: number }; goal: { x: number; z: number } }
  /** Null when the pack is composed standalone — the weapon then stays null. */
  inventory: { items: ReadonlyArray<{ id: string; position: { x: number; z: number } }> } | null
  /** Soft-keepout points from other composed sections (dialogue NPCs, walker stations). */
  occupied: ReadonlyArray<{ x: number; z: number }>
}

const WALL_MARGIN = 1
const KEEPOUT = 3
const SEPARATION = 2
const SPAWN_AGGRO_MARGIN = 1
const DRAW_BUDGET = 200

const round2 = (value: number): number => Math.round(value * 100) / 100
const far = (a: { x: number; z: number }, b: { x: number; z: number }, min: number): boolean =>
  Math.hypot(a.x - b.x, a.z - b.z) >= min

/** Seeded enemy posts + weapon pick; defaults deliberately live outside GameSpec. */
export function composeCombatSection(input: CombatComposeInput, rng: SeededRng): CombatPackConfig {
  const playerMaxHealth = input.specConfig.playerMaxHealth ?? COMBAT_DEFAULTS.player.maxHealth
  const antagonists = input.cast.filter((member) => member.role === 'antagonist')
  const extent = input.arena.half - WALL_MARGIN
  // The player must never be aggro-locked at spawn (spec §4.1).
  const spawnKeepout = COMBAT_DEFAULTS.enemy.aggroRadius + SPAWN_AGGRO_MARGIN
  const soft = [...(input.inventory?.items.map((item) => item.position) ?? []), ...input.occupied]
  const posts: Array<{ x: number; z: number }> = []

  const enemies: EnemyDef[] = antagonists.map((member, index) => {
    let post: { x: number; z: number } | null = null
    for (let draw = 0; draw < DRAW_BUDGET && !post; draw += 1) {
      const candidate = {
        x: round2((rng.next() * 2 - 1) * extent),
        z: round2((rng.next() * 2 - 1) * extent)
      }
      if (!far(candidate, input.arena.spawn, spawnKeepout)) continue
      if (!far(candidate, input.arena.goal, KEEPOUT)) continue
      if (!soft.every((point) => far(candidate, point, SEPARATION))) continue
      if (!posts.every((point) => far(candidate, point, SEPARATION))) continue
      post = candidate
    }
    if (!post) throw new Error(`Enemy post placement budget exhausted: enemy ${index + 1}`)
    posts.push(post)
    return { id: `enemy-${index + 1}`, name: member.name, post, ...COMBAT_DEFAULTS.enemy }
  })

  const items = input.inventory?.items ?? []
  const weaponItemId = items.length > 0 ? items[Math.floor(rng.next() * items.length)]!.id : null

  return packConfigSchema.parse({
    player: { ...COMBAT_DEFAULTS.player, maxHealth: playerMaxHealth },
    weapon: { itemId: weaponItemId, damageMultiplier: COMBAT_DEFAULTS.weaponDamageMultiplier },
    enemies
  })
}
