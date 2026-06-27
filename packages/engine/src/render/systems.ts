import type { EngineEntity } from '../ecs/components'
import type { System } from '../ecs/scheduler'
import type { World } from '../ecs/world'
import { vec3 } from '../math/vec3'
import { quat } from '../math/quat'
import type { GroupId, RenderPort } from './port'

type RenderEntity<E extends EngineEntity> = E & {
  renderable: NonNullable<E['renderable']>
  transform: NonNullable<E['transform']>
}

export function registerRenderables<E extends EngineEntity>(
  world: World<E>,
  port: RenderPort,
  group?: GroupId
): () => void {
  const query = world.with('renderable', 'transform')
  const add = (entity: RenderEntity<E>): void => {
    port.add(entity, entity.renderable, group)
  }
  for (const entity of query) add(entity)
  const offAdd = query.onEntityAdded.subscribe(add)
  const offRemove = query.onEntityRemoved.subscribe((entity) => port.remove(entity))
  return () => { offAdd(); offRemove() }
}

/** Pushes interpolated transforms to the render port each rAF. */
export function renderSystem<Ctx extends { world: World<EngineEntity>; alpha: number }>(
  port: RenderPort
): System<Ctx> {
  return {
    name: 'render',
    stage: 'render',
    run(ctx) {
      for (const entity of ctx.world.with('transform', 'renderable')) {
        const t = entity.transform
        port.setPose(
          entity,
          vec3.lerp(t.prevPosition, t.position, ctx.alpha),
          quat.nlerp(t.prevRotation, t.rotation, ctx.alpha)
        )
      }
    }
  }
}
