import { defineKind, z } from '@automata/engine'

const tuple3 = z.tuple([z.number(), z.number(), z.number()])

const boxGeometry = z.object({
  shape: z.literal('box'),
  size: tuple3,
  pos: tuple3,
  /** Euler degrees; used for ramps. */
  rot: tuple3.optional(),
  color: z.string().min(1),
  friction: z.number().min(0).default(0.6)
})

const cylinderGeometry = z.object({
  shape: z.literal('cylinder'),
  radius: z.number().positive(),
  height: z.number().positive(),
  pos: tuple3,
  rot: tuple3.optional(),
  color: z.string().min(1),
  friction: z.number().min(0).default(0.6)
})

export const levelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  timeLimitS: z.number().positive(),
  fallY: z.number(),
  spawn: tuple3,
  goal: z.object({ pos: tuple3 }),
  geometry: z.array(z.discriminatedUnion('shape', [boxGeometry, cylinderGeometry])).min(1),
  entities: z.array(z.object({
    archetype: z.string().min(1),
    pos: tuple3,
    /** Per-component archetype overrides, e.g. movingPlatform waypoints. */
    overrides: z.record(z.string(), z.unknown()).optional()
  })).default([])
})

export type Level = z.infer<typeof levelSchema>
export const levelKind = defineKind('level', 'json', levelSchema)

export const worldsManifestSchema = z.object({
  worlds: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    levels: z.array(z.string().min(1)).min(1)
  })).min(1)
})

export type WorldsManifest = z.infer<typeof worldsManifestSchema>
export const worldsManifestKind = defineKind('worlds-manifest', 'json', worldsManifestSchema)
