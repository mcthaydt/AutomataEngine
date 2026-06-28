import { z } from 'zod'
import { projectManifestSchema, sceneDocumentSchema, resourceDocumentSchema, projectSnapshotSchema, PROJECT_FORMAT_VERSION } from './model'
import type { ProjectManifest, ProjectSnapshot, SceneDocument, ResourceDocument } from './model'

/**
 * Canonical single-file bundle serialization.
 *
 * `toProjectBundle` produces a deterministically-ordered view (scenes,
 * resources, entities, and components all sorted by stable ID) so two equal
 * projects serialize byte-for-byte identically — the parity backbone for the
 * Monkey Ball importer. Bundles are loaded back into the map-shaped snapshot.
 */

export interface ProjectBundle {
  formatVersion: typeof PROJECT_FORMAT_VERSION
  manifest: ProjectManifest
  scenes: SceneDocument[]
  resources: ResourceDocument[]
}

function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id))
}

/** Produce a canonical, stably-ordered bundle without mutating `snapshot`. */
export function toProjectBundle(snapshot: ProjectSnapshot): ProjectBundle {
  const scenes = byId(Object.values(snapshot.scenes)).map((scene) => ({
    ...scene,
    entities: byId(scene.entities).map((entity) => ({ ...entity, components: byId(entity.components) }))
  }))
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    manifest: snapshot.manifest,
    scenes,
    resources: byId(Object.values(snapshot.resources))
  }
}

/** Two-space JSON with a trailing newline. */
export function stringifyProjectBundle(bundle: ProjectBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`
}

const projectBundleSchema = z.object({
  formatVersion: z.literal(PROJECT_FORMAT_VERSION),
  manifest: projectManifestSchema,
  scenes: z.array(sceneDocumentSchema),
  resources: z.array(resourceDocumentSchema)
})

/** Parse bundle text back into a validated snapshot; never silently repairs. */
export function parseProjectBundle(text: string): ProjectSnapshot {
  const bundle = projectBundleSchema.parse(JSON.parse(text))
  return projectSnapshotSchema.parse({
    manifest: bundle.manifest,
    scenes: Object.fromEntries(bundle.scenes.map((scene) => [scene.id, scene])),
    resources: Object.fromEntries(bundle.resources.map((resource) => [resource.id, resource]))
  })
}
