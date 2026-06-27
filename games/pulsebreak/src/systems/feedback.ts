import { spawnBurst, type AudioPort, type EngineEvent, type EventQueue, type Vec3 } from '@automata/engine'
import type { GameCtx } from '../game/context'

/** A gameplay fact the cosmetic layer (sound + particles) reacts to. */
export type FeedbackKind =
  | 'shoot' | 'enemyShoot' | 'enemyHit' | 'enemyKilled'
  | 'playerHit' | 'waveCleared' | 'bossSpawn' | 'victory' | 'defeat'

export interface FeedbackEvent extends EngineEvent {
  type: 'feedback'
  kind: FeedbackKind
  origin?: Vec3
}

interface BurstSpec { count: number; speed: number; lifetimeS: number; color: string }
interface FeedbackSpec { sound: string; burst?: BurstSpec }

/** The single source of "feel": sound + particle burst for each gameplay fact. */
export const FEEDBACK: Record<FeedbackKind, FeedbackSpec> = {
  shoot: { sound: 'shoot' },
  enemyShoot: { sound: 'enemyShoot' },
  enemyHit: { sound: 'hit', burst: { count: 5, speed: 2, lifetimeS: 0.3, color: '#aef9ff' } },
  enemyKilled: { sound: 'kill', burst: { count: 18, speed: 4, lifetimeS: 0.7, color: '#ff2e88' } },
  playerHit: { sound: 'hurt', burst: { count: 14, speed: 3.5, lifetimeS: 0.6, color: '#ff5964' } },
  waveCleared: { sound: 'wave' },
  bossSpawn: { sound: 'boss' },
  victory: { sound: 'win' },
  defeat: { sound: 'lose' }
}

/** Records a gameplay fact for the feedback drain to turn into sound + particles. */
export function emitFeedback(queue: EventQueue, kind: FeedbackKind, origin?: Vec3): void {
  queue.emit({ type: 'feedback', kind, origin })
}

export type FeedbackConsumer = (ctx: GameCtx) => void

/**
 * Builds the cosmetic drain: the only place that touches audio or spawns juice
 * particles. Register via Scheduler.onFixedEnd so it runs after every emitter.
 */
export function createFeedback(feedback: EventQueue, audio: AudioPort): FeedbackConsumer {
  return (ctx) => {
    for (const event of feedback.read<FeedbackEvent>('feedback')) {
      const spec = FEEDBACK[event.kind]
      audio.play(spec.sound)
      if (spec.burst && event.origin) {
        spawnBurst(ctx.world, { origin: event.origin, ...spec.burst })
      }
    }
  }
}
