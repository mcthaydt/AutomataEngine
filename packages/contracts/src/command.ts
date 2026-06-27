import { z } from 'zod'

export const vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() })
export type Vec3 = z.infer<typeof vec3Schema>

export const surfaceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('color'), value: z.string() }),
  z.object({ kind: z.literal('texture'), textureId: z.string() })
])
export type Surface = z.infer<typeof surfaceSchema>

export const itemKindSchema = z.enum(['box', 'cylinder', 'archetype', 'marker'])
export type ItemKind = z.infer<typeof itemKindSchema>

export const boxShapeSchema = z.object({ type: z.literal('box'), size: vec3Schema })
export type BoxShape = z.infer<typeof boxShapeSchema>

export const cylinderShapeSchema = z.object({
  type: z.literal('cylinder'),
  radius: z.number(),
  height: z.number()
})
export type CylinderShape = z.infer<typeof cylinderShapeSchema>

export const archetypeRefSchema = z.object({ type: z.literal('archetype'), name: z.string() })
export type ArchetypeRef = z.infer<typeof archetypeRefSchema>

export const markerRefSchema = z.object({ type: z.literal('marker'), markerId: z.string() })
export type MarkerRef = z.infer<typeof markerRefSchema>

export const itemShapeSchema = z.discriminatedUnion('type', [
  boxShapeSchema,
  cylinderShapeSchema,
  archetypeRefSchema,
  markerRefSchema
])
export type ItemShape = z.infer<typeof itemShapeSchema>

export const itemTransformSchema = z.object({ position: vec3Schema, rotationEuler: vec3Schema })
export type ItemTransform = z.infer<typeof itemTransformSchema>

export const sceneItemSchema = z.object({
  id: z.string(),
  kind: itemKindSchema,
  transform: itemTransformSchema,
  shape: itemShapeSchema,
  surface: surfaceSchema
})
export type SceneItem = z.infer<typeof sceneItemSchema>

export const addItemSchema = z.object({ type: z.literal('addItem'), item: sceneItemSchema })
export const moveSelectedSchema = z.object({
  type: z.literal('moveSelected'),
  ids: z.array(z.string()),
  delta: vec3Schema
})
export const setItemFieldSchema = z.object({
  type: z.literal('setItemField'),
  id: z.string(),
  path: z.string(),
  value: z.unknown()
})
export const setSurfaceSchema = z.object({
  type: z.literal('setSurface'),
  id: z.string(),
  surface: surfaceSchema
})
export const setMetadataSchema = z.object({
  type: z.literal('setMetadata'),
  path: z.string(),
  value: z.unknown()
})
export const deleteItemsSchema = z.object({ type: z.literal('deleteItems'), ids: z.array(z.string()) })
export const loadDocSchema = z.object({ type: z.literal('loadDoc'), doc: z.unknown() })

export const sceneCommandSchema = z.discriminatedUnion('type', [
  addItemSchema,
  moveSelectedSchema,
  setItemFieldSchema,
  setSurfaceSchema,
  setMetadataSchema,
  deleteItemsSchema,
  loadDocSchema
])
export type SceneCommand = z.infer<typeof sceneCommandSchema>
