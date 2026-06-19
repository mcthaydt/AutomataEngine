import { spawnBurst, type AudioPort, type EngineEvent, type EventQueue, type Vec3 } from '@automata/engine'
import type { GameCtx } from '../game/context'

/** A gameplay fact the cosmetic layer reacts to. */
export type FeedbackKind = 'collected' | 'bumped' | 'goalReached' | 'fell'

export interface FeedbackEvent extends EngineEvent {
  type: 'feedback'
  kind: FeedbackKind
  origin?: Vec3
}

interface BurstSpec { count: number; speed: number; lifetimeS: number; color: string }
interface FeedbackSpec { sound: string; burst?: BurstSpec }

/**
 * The single source of "feel": which sound plays and which particle burst
 * spawns for each gameplay fact. Tuning a level's juice means editing this
 * table, not five different systems. Every `sound` must exist in audio/sounds.
 */
export const FEEDBACK: Record<FeedbackKind, FeedbackSpec> = {
  collected: { sound: 'pickup', burst: { count: 10, speed: 2.5, lifetimeS: 0.5, color: '#ffd23f' } },
  bumped: { sound: 'bumper', burst: { count: 8, speed: 2, lifetimeS: 0.4, color: '#ff5964' } },
  goalReached: { sound: 'goal', burst: { count: 24, speed: 3.5, lifetimeS: 0.8, color: '#4ecdc4' } },
  fell: { sound: 'fall' }
}

/** Records a gameplay fact for the feedback drain to turn into sound + particles. */
export function emitFeedback(queue: EventQueue, kind: FeedbackKind, origin?: Vec3): void {
  queue.emit({ type: 'feedback', kind, origin })
}

/** Drains gameplay facts to sound + particles. */
export type FeedbackConsumer = (ctx: GameCtx) => void

/**
 * Builds the cosmetic drain: the only place that touches audio or spawns juice
 * particles, so gameplay logic stays pure. Register it via Scheduler.onFixedEnd
 * so it runs after every emitter regardless of registration order.
 */
export function createFeedback(feedback: EventQueue, audio: AudioPort): FeedbackConsumer {
  return (ctx) => {
    for (const event of feedback.read<FeedbackEvent>('feedback')) {
      const spec = FEEDBACK[event.kind]
      audio.play(spec.sound)
      // No origin (e.g. a fact with no spatial source, or an entity without a
      // transform) means sound only — skip the burst rather than spawn at (0,0,0).
      if (spec.burst && event.origin) {
        spawnBurst(ctx.world, { origin: event.origin, ...spec.burst })
      }
    }
  }
}
