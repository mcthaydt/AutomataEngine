import { z } from '@automata/project'
import type { CombatPackConfig, CombatSliceValue } from './config'
import { applyPlayerDamage, createHealth, tickInvuln, type HealthState } from './healthCore'
import { createEnemyAi, stepEnemyAi, type EnemyAiState } from './enemyAiCore'

/** Pure per-tick engagement resolution over healthCore + enemyAiCore. */
export interface EnemyCombatState { hp: number; cooldown: number; ai: EnemyAiState }
export interface CombatState {
  player: HealthState
  playerCooldown: number
  enemies: Record<string, EnemyCombatState>
}

export interface CombatStepResult {
  state: CombatState
  /** Enemy ids newly defeated this tick (each id is reported exactly once). */
  defeatedEnemyIds: readonly string[]
  playerDefeated: boolean
}

export function createCombatState(config: CombatPackConfig): CombatState {
  return {
    player: createHealth(config.player),
    playerCooldown: 0,
    enemies: Object.fromEntries(config.enemies.map((enemy) => [
      enemy.id, { hp: enemy.maxHealth, cooldown: 0, ai: createEnemyAi(enemy) }
    ]))
  }
}

export function isWeaponHeld(config: CombatPackConfig, collected: readonly string[]): boolean {
  return config.weapon.itemId !== null && collected.includes(config.weapon.itemId)
}

export function playerDamage(config: CombatPackConfig, weaponHeld: boolean): number {
  return config.player.attackDamage * (weaponHeld ? config.weapon.damageMultiplier : 1)
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

/**
 * Fixed step order (spec §3.4): enemy AI movement, player auto-attack, enemy
 * attacks, invulnerability drain. Nearest-target ties break by config order,
 * which is enemy id order as composed.
 */
export function stepCombat(
  state: CombatState, player: { x: number; z: number }, config: CombatPackConfig,
  dt: number, weaponHeld: boolean
): CombatStepResult {
  const enemies: Record<string, EnemyCombatState> = {}
  for (const enemy of config.enemies) {
    const entry = state.enemies[enemy.id]!
    enemies[enemy.id] = entry.hp <= 0
      ? entry
      : { ...entry, cooldown: Math.max(0, entry.cooldown - dt), ai: stepEnemyAi(entry.ai, enemy, player, dt) }
  }

  const defeatedEnemyIds: string[] = []
  let playerCooldown = Math.max(0, state.playerCooldown - dt)
  if (playerCooldown === 0) {
    let targetId: string | null = null
    let best = Infinity
    for (const enemy of config.enemies) {
      const entry = enemies[enemy.id]!
      if (entry.hp <= 0) continue
      const dist = distance(entry.ai.position, player)
      if (dist <= config.player.attackRadius && dist < best) { best = dist; targetId = enemy.id }
    }
    if (targetId) {
      const entry = enemies[targetId]!
      const hp = Math.max(0, entry.hp - playerDamage(config, weaponHeld))
      enemies[targetId] = { ...entry, hp }
      playerCooldown = config.player.attackCooldownSeconds
      if (hp === 0) defeatedEnemyIds.push(targetId)
    }
  }

  let health = state.player
  let playerDefeated = false
  for (const enemy of config.enemies) {
    const entry = enemies[enemy.id]!
    if (entry.hp <= 0 || entry.cooldown > 0) continue
    if (distance(entry.ai.position, player) > enemy.attackRadius) continue
    const hit = applyPlayerDamage(health, enemy.attackDamage, config.player)
    health = hit.state
    playerDefeated = playerDefeated || hit.defeated
    enemies[enemy.id] = { ...entry, cooldown: enemy.attackCooldownSeconds }
  }
  health = tickInvuln(health, dt)

  return { state: { player: health, playerCooldown, enemies }, defeatedEnemyIds, playerDefeated }
}

/** The pack's objectives-complete gate; vacuously true with no enemies. */
export function enemiesDefeated(state: CombatState, config: CombatPackConfig): boolean {
  return config.enemies.every((enemy) => state.enemies[enemy.id]!.hp <= 0)
}

/** Shared by the browser adapter and the eval hook — parity by construction. */
export function combatSliceValue(state: CombatState, config: CombatPackConfig): CombatSliceValue {
  return {
    playerHp: state.player.hp,
    invulnSeconds: state.player.invulnSeconds,
    enemies: Object.fromEntries(config.enemies.map((enemy) => {
      const entry = state.enemies[enemy.id]!
      return [enemy.id, { hp: entry.hp, mode: entry.ai.mode }]
    }))
  }
}

const savedStateSchema = z.strictObject({
  player: z.strictObject({ hp: z.number().int().min(1).max(20) }),
  enemies: z.array(z.strictObject({
    id: z.string().min(1).max(60),
    hp: z.number().int().min(0).max(30)
  })).max(12)
})

export function serializeCombatState(state: CombatState): unknown {
  return {
    player: { hp: state.player.hp },
    enemies: Object.entries(state.enemies).map(([id, entry]) => ({ id, hp: entry.hp }))
  }
}

/**
 * Parse-or-throw; saved enemy ids must exactly match the config set. Positions,
 * modes, cooldowns, and the invulnerability window are recomputed: live enemies
 * snap to their post on load (documented simplification, walker precedent).
 */
export function deserializeCombatState(raw: unknown, config: CombatPackConfig): CombatState {
  const parsed = savedStateSchema.parse(raw)
  if (parsed.player.hp > config.player.maxHealth) {
    throw new Error(`Saved combat state player hp ${parsed.player.hp} above maxHealth`)
  }
  const byId = new Map(parsed.enemies.map((entry) => [entry.id, entry.hp]))
  const expected = new Map(config.enemies.map((enemy) => [enemy.id, enemy]))
  for (const entry of parsed.enemies) {
    if (!expected.has(entry.id)) throw new Error(`Saved combat state has unknown enemy "${entry.id}"`)
    if (entry.hp > expected.get(entry.id)!.maxHealth) {
      throw new Error(`Saved combat state enemy "${entry.id}" hp ${entry.hp} above maxHealth`)
    }
  }
  for (const enemy of config.enemies) {
    if (!byId.has(enemy.id)) throw new Error(`Saved combat state missing enemy "${enemy.id}"`)
  }
  return {
    player: { hp: parsed.player.hp, invulnSeconds: 0 },
    playerCooldown: 0,
    enemies: Object.fromEntries(config.enemies.map((enemy) => [
      enemy.id, { hp: byId.get(enemy.id)!, cooldown: 0, ai: createEnemyAi(enemy) }
    ]))
  }
}
