import { defineKind, z } from '@automata/engine'
import type { Level, PhysicsTuning, WorldsManifest } from './types'

export type { Level, PhysicsTuning, WorldsManifest } from './types'

const tuple3 = z.tuple([z.number(), z.number(), z.number()])

const boxGeometry = z.object({
  shape: z.literal('box'),
  uid: z.string().optional(),
  size: tuple3,
  pos: tuple3,
  rot: tuple3.optional(),
  color: z.string().min(1),
  friction: z.number().min(0).default(0.6)
})

const cylinderGeometry = z.object({
  shape: z.literal('cylinder'),
  uid: z.string().optional(),
  radius: z.number().positive(),
  height: z.number().positive(),
  pos: tuple3,
  rot: tuple3.optional(),
  color: z.string().min(1),
  friction: z.number().min(0).default(0.6)
})

/** Private parser for retained pre-project level fixtures. */
export const levelSchema: z.ZodType<Level> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  timeLimitS: z.number().positive(),
  fallY: z.number(),
  spawn: tuple3,
  goal: z.object({ pos: tuple3 }),
  geometry: z.array(z.discriminatedUnion('shape', [boxGeometry, cylinderGeometry])).min(1),
  entities: z.array(z.object({
    archetype: z.string().min(1),
    uid: z.string().optional(),
    pos: tuple3,
    overrides: z.record(z.string(), z.unknown()).optional()
  })).default([])
})
export const levelKind = defineKind('level', 'json', levelSchema)

export const worldsManifestSchema: z.ZodType<WorldsManifest> = z.object({
  worlds: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    levels: z.array(z.string().min(1)).min(1)
  })).min(1)
})
export const worldsManifestKind = defineKind('worlds-manifest', 'json', worldsManifestSchema)

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

export function toPhysicsTuning(raw: z.infer<typeof rawPhysicsTuning>): PhysicsTuning {
  return {
    maxTiltRad: (raw['max-tilt-deg'] * Math.PI) / 180,
    tiltSmooth: raw['tilt-smooth'],
    gravity: raw.gravity,
    ball: raw.ball
  }
}
