import { z } from 'zod'
import type { Vec3 } from './command'

export const testPlayResultSchema = z.object({
  outcome: z.enum(['completed', 'gameOver', 'incomplete']),
  timeMs: z.number(),
  fallCount: z.number(),
  bananas: z.number(),
  steps: z.number()
})
export type TestPlayResult = z.infer<typeof testPlayResultSchema>

export interface HeadlessOpts {
  input?: (step: number, observation: PlayObservation) => { x: number; y: number }
  maxSteps: number
}

/** Per-step world readout exposed to a closed-loop scoring policy (consumed by the M16b tuning loop). */
export interface PlayObservation {
  step: number
  ball: { position: Vec3; velocity: Vec3 }
  goal: Vec3
}
