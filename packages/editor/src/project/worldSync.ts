import {
  createTransform, createWorld, registerRenderables, renderSystem,
  type EngineEntity, type Quat, type RenderableDef, type RenderPort, type Vec3, type World
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

function sameVec3(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
}

function sameQuat(a: Quat, b: Quat): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w
}

function sameRenderable(a: RenderableDef, b: RenderableDef): boolean {
  if (a.primitive !== b.primitive || a.color !== b.color) return false
  switch (a.primitive) {
    case 'box':
      return sameVec3(a.size, (b as Extract<RenderableDef, { primitive: 'box' }>).size)
    case 'sphere':
      return a.radius === (b as Extract<RenderableDef, { primitive: 'sphere' }>).radius
    case 'cylinder': {
      const cylinder = b as Extract<RenderableDef, { primitive: 'cylinder' }>
      return a.radius === cylinder.radius && a.height === cylinder.height
    }
  }
}

/** Returns whether two projected items produce the identical renderable object. */
function sameSeed(a: SpatialItem, b: SpatialItem): boolean {
  return sameVec3(a.position, b.position) && sameQuat(a.rotation, b.rotation) && sameRenderable(a.renderable, b.renderable)
}

export function createProjectWorldSync(render: RenderPort): ProjectWorldSync {
  const stage = render.createGroup()
  const world: World<EditorEntity> = createWorld<EditorEntity>()
  const offRender = registerRenderables(world, render, stage)
  const renderStep = renderSystem<{ world: World<EngineEntity>; alpha: number }>(render)
  const current = new Map<string, { entity: EditorEntity; item: SpatialItem }>()

  const applyHighlight = (selected: ReadonlySet<string>): void => {
    for (const entity of world.with('editorId')) render.setHighlight(entity, selected.has(entity.editorId))
  }

  return {
    syncNow(items, selected) {
      const wanted = new Map(items.map((item) => [item.entityId, item]))
      for (const [id, record] of [...current]) {
        const item = wanted.get(id)
        if (!item || !sameSeed(item, record.item)) {
          world.remove(record.entity)
          current.delete(id)
        }
      }
      for (const item of items) {
        if (current.has(item.entityId)) continue
        const entity = world.add({ editorId: item.entityId, transform: createTransform(item.position, item.rotation), renderable: item.renderable })
        current.set(item.entityId, { entity, item })
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
