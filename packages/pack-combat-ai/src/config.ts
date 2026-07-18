import { z } from '@automata/project'

/**
 * Compiled pack config: proximity auto-combat over cast-derived enemies.
 * Contract names for the slice/events this pack owns and emits live here; the
 * inventory-pack slice id is a deliberate string copy — pack-to-pack imports
 * are forbidden and the read degrades gracefully when the slice is absent.
 */
export const COMBAT_SLICE_ID = 'combat'
export const INVENTORY_SLICE_ID = 'inventory'
export const ENEMY_DEFEATED_EVENT = 'enemyDefeated'
export const PLAYER_DEFEATED_EVENT = 'playerDefeated'

/** Runtime slice payload — also the eval hook's published shape. */
export interface CombatSliceValue {
  playerHp: number
  invulnSeconds: number
  enemies: Record<string, { hp: number; mode: 'idle' | 'chase' | 'return' }>
}

const idSchema = z.string().min(1).max(60)
const positionSchema = z.strictObject({ x: z.number(), z: z.number() })

const playerSchema = z.strictObject({
  maxHealth: z.number().int().min(1).max(20),
  attackDamage: z.number().min(1).max(10),
  attackRadius: z.number().min(0.5).max(5),
  attackCooldownSeconds: z.number().min(0.1).max(5),
  secondWindSeconds: z.number().min(0.5).max(10)
})
export type PlayerCombatConfig = z.infer<typeof playerSchema>

const weaponSchema = z.strictObject({
  itemId: idSchema.nullable(),
  damageMultiplier: z.number().min(1).max(5)
})

const enemySchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(80),
  post: positionSchema,
  maxHealth: z.number().int().min(1).max(30),
  attackDamage: z.number().min(1).max(10),
  attackRadius: z.number().min(0.5).max(5),
  attackCooldownSeconds: z.number().min(0.1).max(5),
  speed: z.number().min(0.5).max(8),
  aggroRadius: z.number().min(1).max(10),
  leashRadius: z.number().min(2).max(20)
})
export type EnemyDef = z.infer<typeof enemySchema>

const baseConfigSchema = z.strictObject({
  player: playerSchema,
  weapon: weaponSchema,
  enemies: z.array(enemySchema).max(12)
})
export type CombatPackConfig = z.infer<typeof baseConfigSchema>

const duplicates = (ids: string[]): string[] =>
  ids.filter((id, index) => ids.indexOf(id) !== index)

export const packConfigSchema: z.ZodType<CombatPackConfig> = baseConfigSchema.superRefine((config, ctx) => {
  const issue = (message: string): void => { ctx.addIssue({ code: 'custom', message }) }
  for (const dup of duplicates(config.enemies.map((enemy) => enemy.id))) issue(`duplicate enemy id "${dup}"`)
  for (const enemy of config.enemies) {
    if (enemy.aggroRadius >= enemy.leashRadius) issue(`enemy "${enemy.id}" aggroRadius must be below leashRadius`)
  }
})
