import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import { packCompatibility } from '@automata/game-kit'
import {
  COMBAT_SLICE_ID, ENEMY_DEFEATED_EVENT, INVENTORY_SLICE_ID, PLAYER_DEFEATED_EVENT,
  packConfigSchema, type CombatPackConfig, type EnemyDef
} from './config'
import {
  combatSliceValue, createCombatState, deserializeCombatState, enemiesDefeated,
  isWeaponHeld, serializeCombatState, stepCombat, type CombatState
} from './combatCore'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const ENEMY_COLOR = '#ff5470'
const ENEMY_RADIUS = 0.45

/** The fourth standard pack: proximity auto-combat with idle/chase/return enemies. */
export const combatAiPack: GamePack<CombatPackConfig> = {
  id: 'combat-ai',
  version: '1.0.0',
  compatibility: packCompatibility({
    integratesWith: ['interaction-inventory'],
    stateSlices: { owns: [COMBAT_SLICE_ID], reads: [INVENTORY_SLICE_ID] },
    events: { emits: [ENEMY_DEFEATED_EVENT, PLAYER_DEFEATED_EVENT], consumes: [] }
  }),
  configSchema: packConfigSchema,
  register(ctx, config): PackRuntimeHandle {
    let combat: CombatState = createCombatState(config)
    ctx.state.register(COMBAT_SLICE_ID, combatAiPack.id, combatSliceValue(combat, config))

    const entities = new Map<string, { id: string }>()
    const addEnemyRenderable = (enemy: EnemyDef): void => {
      const entity = { id: `combat-enemy-${enemy.id}` }
      entities.set(enemy.id, entity)
      ctx.render.add(entity, { primitive: 'sphere', radius: ENEMY_RADIUS, color: ENEMY_COLOR })
      ctx.render.setPose(entity, { x: enemy.post.x, y: ENEMY_RADIUS, z: enemy.post.z }, IDENTITY)
    }
    for (const enemy of config.enemies) addEnemyRenderable(enemy)

    const hud = document.createElement('div')
    hud.className = 'combat-hud'
    ctx.host.overlays.append(hud)
    const updateHud = (): void => {
      const downed = config.enemies.filter((enemy) => combat.enemies[enemy.id]!.hp <= 0).length
      hud.textContent = `HP ${combat.player.hp}/${config.player.maxHealth} · foes ${downed}/${config.enemies.length}`
    }
    updateHud()

    const renderEnemies = (): void => {
      for (const enemy of config.enemies) {
        const entity = entities.get(enemy.id)
        if (!entity) continue
        const position = combat.enemies[enemy.id]!.ai.position
        ctx.render.setPose(entity, { x: position.x, y: ENEMY_RADIUS, z: position.z }, IDENTITY)
      }
    }

    /** Reconcile markers to the state (defeat and load), publish, refresh HUD. */
    const applyState = (next: CombatState): void => {
      combat = next
      for (const enemy of config.enemies) {
        const alive = combat.enemies[enemy.id]!.hp > 0
        const entity = entities.get(enemy.id)
        if (!alive && entity) { ctx.render.remove(entity); entities.delete(enemy.id) }
        else if (alive && !entity) addEnemyRenderable(enemy)
      }
      ctx.state.set(COMBAT_SLICE_ID, combatAiPack.id, combatSliceValue(combat, config))
      renderEnemies()
      updateHud()
    }

    return {
      fixedUpdate(dt, world) {
        const collected = ctx.state.has(INVENTORY_SLICE_ID)
          ? ((ctx.state.get(INVENTORY_SLICE_ID) as { collected?: readonly string[] }).collected ?? [])
          : []
        const result = stepCombat(combat, world.playerPosition, config, dt, isWeaponHeld(config, collected))
        applyState(result.state)
        for (const enemyId of result.defeatedEnemyIds) {
          ctx.events.emit(ENEMY_DEFEATED_EVENT, { packId: combatAiPack.id, enemyId })
        }
        if (result.playerDefeated) {
          ctx.events.emit(PLAYER_DEFEATED_EVENT, { packId: combatAiPack.id })
        }
      },
      objectivesComplete: () => enemiesDefeated(combat, config),
      saveState: () => serializeCombatState(combat),
      loadState(raw) { applyState(deserializeCombatState(raw, config)) },
      dispose() {
        for (const entity of entities.values()) ctx.render.remove(entity)
        entities.clear()
        hud.remove()
      }
    }
  }
}
