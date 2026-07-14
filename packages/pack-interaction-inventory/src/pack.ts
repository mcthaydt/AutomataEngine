import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import {
  createInventoryState, inventoryComplete, packConfigSchema, stepInventory,
  type InventoryPackConfig, type InventoryState
} from './core'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const ITEM_COLOR = '#ffd23f'

/** The first real capability pack: item pickups + inventory HUD over interface v1. */
export const interactionInventoryPack: GamePack<InventoryPackConfig> = {
  id: 'interaction-inventory',
  version: '1.0.0',
  configSchema: packConfigSchema,
  register(ctx, config): PackRuntimeHandle {
    let state: InventoryState = createInventoryState()
    const entities = new Map(config.items.map((item) => [item.id, { id: `inventory-item-${item.id}` }]))
    for (const item of config.items) {
      const entity = entities.get(item.id)!
      ctx.render.add(entity, { primitive: 'sphere', radius: 0.35, color: ITEM_COLOR })
      ctx.render.setPose(entity, { x: item.position.x, y: 0.35, z: item.position.z }, IDENTITY)
    }

    const hud = document.createElement('div')
    hud.className = 'inventory-hud'
    if (config.iconPath !== null) {
      const icon = document.createElement('img')
      icon.src = config.iconPath
      icon.alt = 'item'
      icon.width = 16
      icon.height = 16
      hud.append(icon)
    }
    const count = document.createElement('span')
    hud.append(count)
    const updateHud = (): void => { count.textContent = ` ${state.collected.length}/${config.items.length}` }
    updateHud()
    ctx.host.overlays.append(hud)

    return {
      fixedUpdate(_dt, world) {
        const next = stepInventory(state, world.playerPosition, config)
        if (next === state) return
        for (const id of next.collected) {
          if (state.collected.includes(id)) continue
          const entity = entities.get(id)
          if (entity) { ctx.render.remove(entity); entities.delete(id) }
        }
        state = next
        updateHud()
      },
      objectivesComplete: () => inventoryComplete(state, config),
      dispose() {
        for (const entity of entities.values()) ctx.render.remove(entity)
        entities.clear()
        hud.remove()
      }
    }
  }
}
