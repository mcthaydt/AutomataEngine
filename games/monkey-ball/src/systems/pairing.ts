import type { EngineEvent } from '@automata/engine'
import type { Entity } from '../entity'

/** Extends EngineEvent so it satisfies EventQueue.read<T>'s constraint. */
export interface PairEvent extends EngineEvent { a: Entity; b: Entity }

/**
 * If the event pairs the ball with an entity carrying `tag`, returns that
 * entity; otherwise null. Reused by goal, collection, and bumper.
 */
export function ballPartner(event: PairEvent, tag: keyof Entity): Entity | null {
  if (event.a.ball !== undefined && event.b[tag] !== undefined) return event.b
  if (event.b.ball !== undefined && event.a[tag] !== undefined) return event.a
  return null
}
