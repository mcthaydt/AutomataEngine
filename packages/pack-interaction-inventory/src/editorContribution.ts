import type { PackEditorContribution } from '@automata/game-kit'
import { packConfigSchema } from './core'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const ITEM_COLOR = '#ffd23f'

/**
 * Thin editor preview: markers for the composed items. prefabs is empty on
 * purpose — inventory items are composition-owned, not scene-authored; making
 * them scene entities is a logged capability gap, not silently faked here.
 */
export const inventoryEditorContribution: PackEditorContribution = {
  packId: 'interaction-inventory',
  prefabs: [],
  createPreview(config, render) {
    const parsed = packConfigSchema.parse(config)
    const entities = parsed.items.map((item) => ({ id: `preview-inventory-item-${item.id}` }))
    parsed.items.forEach((item, index) => {
      const entity = entities[index]!
      render.add(entity, { primitive: 'sphere', radius: 0.35, color: ITEM_COLOR })
      render.setPose(entity, { x: item.position.x, y: 0.35, z: item.position.z }, IDENTITY)
    })
    return { dispose() { for (const entity of entities) render.remove(entity) } }
  }
}
