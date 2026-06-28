import {
  createTransform, createWorld, registerRenderables, renderSystem,
  type EngineEntity, type RenderPort, type World
} from '@automata/engine'
import type { SpatialItem } from './spatial'

type EditorEntity = EngineEntity & { editorId?: string }

/**
 * Reconciles a single render group with the projected spatial items.
 *
 * Entities are keyed by stable entity ID; a seed whose renderable/pose changed is
 * removed and re-added, untouched seeds are left alone, and selection highlight is
 * re-applied each sync. This mirrors the legacy viewport sync but operates on
 * pre-projected `SpatialItem`s rather than a game-built world.
 */
export interface ProjectWorldSync {
  syncNow(items: readonly SpatialItem[], selected: ReadonlySet<string>): void
  applyHighlight(selected: ReadonlySet<string>): void
  render(alpha: number): void
  dispose(): void
}

function seedKey(item: SpatialItem): string {
  return JSON.stringify({ p: item.position, r: item.rotation, d: item.renderable })
}

export function createProjectWorldSync(render: RenderPort): ProjectWorldSync {
  const stage = render.createGroup()
  const world: World<EditorEntity> = createWorld<EditorEntity>()
  const offRender = registerRenderables(world, render, stage)
  const renderStep = renderSystem<{ world: World<EngineEntity>; alpha: number }>(render)
  const current = new Map<string, { entity: EditorEntity; key: string }>()

  const applyHighlight = (selected: ReadonlySet<string>): void => {
    for (const entity of world.with('editorId')) render.setHighlight(entity, selected.has(entity.editorId))
  }

  return {
    syncNow(items, selected) {
      const wanted = new Map(items.map((item) => [item.entityId, item]))
      for (const [id, record] of [...current]) {
        const item = wanted.get(id)
        if (!item || seedKey(item) !== record.key) {
          world.remove(record.entity)
          current.delete(id)
        }
      }
      for (const item of items) {
        if (current.has(item.entityId)) continue
        const entity = world.add({ editorId: item.entityId, transform: createTransform(item.position, item.rotation), renderable: item.renderable })
        current.set(item.entityId, { entity, key: seedKey(item) })
      }
      applyHighlight(selected)
    },
    applyHighlight,
    render(alpha) {
      renderStep.run({ world, alpha })
    },
    dispose() {
      for (const entity of [...world.entities]) world.remove(entity)
      offRender()
      render.removeGroup(stage)
    }
  }
}
