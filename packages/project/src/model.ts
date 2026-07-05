import { z } from 'zod'

/**
 * Persisted on-disk shape for an authored project.
 *
 * These schemas are the durable, game-agnostic contract for everything that is
 * written to a project folder or bundle. Component/resource payloads stay
 * `z.unknown()` here on purpose: the persisted layer must round-trip authored
 * data verbatim, while typed validation against registered schemas happens in a
 * higher layer (`validation.ts`). The manifest is the single formatVersion
 * authority; bumping PROJECT_FORMAT_VERSION plus a core migration in migrate.ts
 * is the only sanctioned way to evolve this shape.
 */

export const PROJECT_FORMAT_VERSION = 2 as const

/** Non-empty stable identifier used for projects, scenes, entities, etc. */
export const projectIdSchema = z.string().min(1)
/** Non-empty relative path inside a project workspace. */
export const projectPathSchema = z.string().min(1)

/** One component placed on an entity. `data` is validated by its registration. */
export const componentInstanceSchema = z.object({
  id: projectIdSchema,
  typeId: projectIdSchema,
  data: z.unknown()
})

/** A node in a scene's entity tree. `parentId` is omitted for scene roots. */
export const entityDocumentSchema = z.object({
  id: projectIdSchema,
  name: projectIdSchema,
  parentId: projectIdSchema.optional(),
  enabled: z.boolean(),
  components: z.array(componentInstanceSchema)
})

/** A single authored scene document. */
export const sceneDocumentSchema = z.object({
  id: projectIdSchema,
  name: projectIdSchema,
  entities: z.array(entityDocumentSchema)
})

/** A standalone, typed resource document (tuning tables, manifests, etc.). */
export const resourceDocumentSchema = z.object({
  id: projectIdSchema,
  typeId: projectIdSchema,
  data: z.unknown()
})

/** The project manifest: identity plus the scene/resource path index. */
export const projectManifestSchema = z.object({
  formatVersion: z.literal(PROJECT_FORMAT_VERSION),
  id: projectIdSchema,
  name: projectIdSchema,
  gameId: projectIdSchema,
  entrySceneId: projectIdSchema,
  scenes: z.array(z.object({ id: projectIdSchema, path: projectPathSchema })),
  resources: z.array(z.object({ id: projectIdSchema, typeId: projectIdSchema, path: projectPathSchema }))
})

/** The fully-loaded in-memory project: manifest plus scenes/resources by ID. */
export const projectSnapshotSchema = z.object({
  manifest: projectManifestSchema,
  scenes: z.record(projectIdSchema, sceneDocumentSchema),
  resources: z.record(projectIdSchema, resourceDocumentSchema)
})

export type ComponentInstance = z.infer<typeof componentInstanceSchema>
export type EntityDocument = z.infer<typeof entityDocumentSchema>
export type SceneDocument = z.infer<typeof sceneDocumentSchema>
export type ResourceDocument = z.infer<typeof resourceDocumentSchema>
export type ProjectManifest = z.infer<typeof projectManifestSchema>
export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>
