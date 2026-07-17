import type { PackEditorContribution } from '@automata/game-kit'
import { packConfigSchema } from './config'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const NPC_COLOR = '#7c5cff'

/**
 * Thin editor preview for composed NPC markers. The empty prefab set is
 * deliberate: these NPCs are composition-owned rather than scene-authored.
 */
export const dialogueQuestsEditorContribution: PackEditorContribution = {
  packId: 'dialogue-quests',
  prefabs: [],
  createPreview(config, render) {
    const parsed = packConfigSchema.parse(config)
    const entities = parsed.npcs.map((npc) => ({ id: `preview-dialogue-npc-${npc.id}` }))
    parsed.npcs.forEach((npc, index) => {
      const entity = entities[index]!
      render.add(entity, { primitive: 'sphere', radius: 0.5, color: NPC_COLOR })
      render.setPose(entity, { x: npc.position.x, y: 0.5, z: npc.position.z }, IDENTITY)
    })
    return { dispose() { for (const entity of entities) render.remove(entity) } }
  }
}
