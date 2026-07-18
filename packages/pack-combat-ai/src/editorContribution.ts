import type { PackEditorContribution } from '@automata/game-kit'
import { packConfigSchema } from './config'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const ENEMY_COLOR = '#ff5470'
const ENEMY_RADIUS = 0.45
const AGGRO_DOT = { radius: 0.12, color: '#ff5470' }
const LEASH_DOT = { radius: 0.08, color: '#ff9db0' }

/**
 * Thin editor preview: enemy posts plus four compass dots on each aggro and
 * leash circle. The empty prefab set is deliberate: enemies are
 * composition-owned, not scenes.
 */
export const combatAiEditorContribution: PackEditorContribution = {
  packId: 'combat-ai',
  prefabs: [],
  createPreview(config, render) {
    const parsed = packConfigSchema.parse(config)
    const entities: Array<{ id: string }> = []
    const dot = (id: string, x: number, z: number, spec: { radius: number; color: string }): void => {
      const entity = { id }
      entities.push(entity)
      render.add(entity, { primitive: 'sphere', radius: spec.radius, color: spec.color })
      render.setPose(entity, { x, y: spec.radius, z }, IDENTITY)
    }
    for (const enemy of parsed.enemies) {
      dot(`preview-combat-enemy-${enemy.id}`, enemy.post.x, enemy.post.z, { radius: ENEMY_RADIUS, color: ENEMY_COLOR })
      const compass = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
      compass.forEach(([dx, dz], index) => {
        dot(`preview-combat-aggro-${enemy.id}-${index}`,
          enemy.post.x + dx * enemy.aggroRadius, enemy.post.z + dz * enemy.aggroRadius, AGGRO_DOT)
        dot(`preview-combat-leash-${enemy.id}-${index}`,
          enemy.post.x + dx * enemy.leashRadius, enemy.post.z + dz * enemy.leashRadius, LEASH_DOT)
      })
    }
    return { dispose() { for (const entity of entities) render.remove(entity) } }
  }
}
