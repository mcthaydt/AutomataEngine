import type { PackEditorContribution } from '@automata/game-kit'
import { packConfigSchema } from './config'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const PICKUP = { radius: 0.3, color: '#3ddc97' }
const SHOP = { radius: 0.5, color: '#c77dff' }
const RADIUS_DOT = { radius: 0.08, color: '#e0aaff' }

/** Thin preview: pickup markers plus four compass dots per shop radius. */
export const economyProgressionEditorContribution: PackEditorContribution = {
  packId: 'economy-progression',
  prefabs: [],

  createPreview(config, render) {
    const parsed = packConfigSchema.parse(config)
    const entities: Array<{ id: string }> = []
    const dot = (
      id: string,
      x: number,
      z: number,
      spec: { radius: number; color: string }
    ): void => {
      const entity = { id }
      entities.push(entity)
      render.add(entity, {
        primitive: 'sphere',
        radius: spec.radius,
        color: spec.color
      })
      render.setPose(entity, { x, y: spec.radius, z }, IDENTITY)
    }

    for (const pickup of parsed.pickups) {
      dot(
        `preview-economy-pickup-${pickup.id}`,
        pickup.position.x,
        pickup.position.z,
        PICKUP
      )
    }
    for (const shop of parsed.shops) {
      dot(
        `preview-economy-shop-${shop.id}`,
        shop.position.x,
        shop.position.z,
        SHOP
      )
      const compass = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
      compass.forEach(([dx, dz], index) => {
        dot(
          `preview-economy-radius-${shop.id}-${index}`,
          shop.position.x + dx * shop.radius,
          shop.position.z + dz * shop.radius,
          RADIUS_DOT
        )
      })
    }

    return {
      dispose() {
        for (const entity of entities) render.remove(entity)
      }
    }
  }
}
