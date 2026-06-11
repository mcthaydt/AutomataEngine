import type { World } from 'miniplex'
import type { EngineEntity } from '../ecs/components'
import type { EventQueue } from '../ecs/events'
import type { System } from '../ecs/scheduler'
import type { PhysicsPort } from './port'

export function registerPhysicsBodies<E extends EngineEntity>(
  world: World<E>,
  port: PhysicsPort
): () => void {
  const query = world.with('rigidBody', 'transform')
  const add = (entity: E): void => {
    port.addBody(entity, entity.rigidBody!, {
      position: entity.transform!.position,
      rotation: entity.transform!.rotation
    })
  }
  for (const entity of query) add(entity)
  const offAdd = query.onEntityAdded.subscribe(add)
  const offRemove = query.onEntityRemoved.subscribe((entity) => port.removeBody(entity))
  return () => { offAdd(); offRemove() }
}

/** Steps physics and forwards events into the engine EventQueue. */
export function physicsStepSystem<Ctx extends { dt: number }>(
  port: PhysicsPort,
  events: EventQueue
): System<Ctx> {
  return {
    name: 'physicsStep',
    stage: 'physics',
    run(ctx) {
      for (const event of port.step(ctx.dt)) {
        const type = event.kind === 'sensor'
          ? (event.started ? 'sensorEnter' : 'sensorExit')
          : (event.started ? 'contactStart' : 'contactEnd')
        events.emit({ type, a: event.a, b: event.b })
      }
    }
  }
}

/** Copies body poses into Transform components (prev <- current first). */
export function physicsSyncSystem<Ctx extends { world: World<EngineEntity> }>(
  port: PhysicsPort
): System<Ctx> {
  return {
    name: 'physicsSync',
    stage: 'postPhysics',
    run(ctx) {
      for (const entity of ctx.world.with('transform', 'rigidBody')) {
        const pose = port.readPose(entity)
        if (!pose) continue
        const t = entity.transform
        t.prevPosition = t.position
        t.prevRotation = t.rotation
        t.position = pose.position
        t.rotation = pose.rotation
      }
    }
  }
}
