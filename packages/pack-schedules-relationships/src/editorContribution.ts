import type { PackEditorContribution } from '@automata/game-kit'
import { packConfigSchema } from './config'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const WALKER_COLOR = '#3ddc84'
const WALKER_RADIUS = 0.35

/**
 * Thin editor preview for composed walkers at their slot-zero stations. The
 * empty prefab set is deliberate: walkers are composition-owned, not scenes.
 */
export const schedulesRelationshipsEditorContribution: PackEditorContribution = {
  packId: 'schedules-relationships',
  prefabs: [],
  createPreview(config, render) {
    const parsed = packConfigSchema.parse(config)
    const entities = parsed.walkers.map((walker) => ({ id: `preview-schedules-walker-${walker.id}` }))
    parsed.walkers.forEach((walker, index) => {
      const entity = entities[index]!
      const station = walker.stations[0]!
      render.add(entity, { primitive: 'sphere', radius: WALKER_RADIUS, color: WALKER_COLOR })
      render.setPose(entity, { x: station.x, y: WALKER_RADIUS, z: station.z }, IDENTITY)
    })
    return { dispose() { for (const entity of entities) render.remove(entity) } }
  }
}
