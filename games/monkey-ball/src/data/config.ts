import { defineKind, z } from '@automata/engine'

const rawPhysicsTuning = z.object({
  'max-tilt-deg': z.number().positive().max(45),
  'tilt-smooth': z.number().min(0).max(1),
  gravity: z.number().positive(),
  ball: z.object({
    radius: z.number().positive(),
    friction: z.number().min(0)
  })
})

export const physicsTuningKind = defineKind('physics-tuning', 'toml', rawPhysicsTuning)

export interface PhysicsTuning {
  maxTiltRad: number
  tiltSmooth: number
  gravity: number
  ball: { radius: number; friction: number }
}

export function toPhysicsTuning(raw: z.infer<typeof rawPhysicsTuning>): PhysicsTuning {
  return {
    maxTiltRad: (raw['max-tilt-deg'] * Math.PI) / 180,
    tiltSmooth: raw['tilt-smooth'],
    gravity: raw.gravity,
    ball: raw.ball
  }
}
