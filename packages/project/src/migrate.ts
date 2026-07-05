import {
  projectManifestSchema, sceneDocumentSchema, resourceDocumentSchema,
  projectSnapshotSchema, PROJECT_FORMAT_VERSION
} from './model'
import type { ProjectManifest, ProjectSnapshot, SceneDocument, ResourceDocument } from './model'

/**
 * Ordered core migration pipeline plus the one parse entry every load path
 * (folder, bundle, autosave) funnels through. Core migrations transform raw
 * pre-validation JSON version-by-version; per-game hooks then upgrade
 * game-owned payloads on the typed snapshot. Never silently repairs:
 * anything but a known older version migrating cleanly fails loudly.
 */

/** Pre-validation shape every load source normalizes into. */
export interface RawProjectDocuments {
  manifest: unknown
  scenes: unknown[]
  resources: unknown[]
}

/** Upgrades game-owned data payloads written at an older formatVersion. */
export type GameMigrateHook = (snapshot: ProjectSnapshot, fromVersion: number) => ProjectSnapshot

export interface ParsedProject {
  snapshot: ProjectSnapshot
  /** formatVersion the documents were read at (≤ PROJECT_FORMAT_VERSION). */
  fromVersion: number
}

/** One core step: transforms documents written at `from` to `from + 1`. */
interface ProjectMigration {
  from: number
  migrate(docs: RawProjectDocuments): RawProjectDocuments
}

const CORE_MIGRATIONS: ProjectMigration[] = []

// A gap in the chain is a programmer error; fail at module load, not at parse time.
if (CORE_MIGRATIONS.length !== PROJECT_FORMAT_VERSION - 1) {
  throw new Error(`Core migrations must cover 1..${PROJECT_FORMAT_VERSION}; found ${CORE_MIGRATIONS.length} steps`)
}
CORE_MIGRATIONS.forEach((migration, index) => {
  if (migration.from !== index + 1) {
    throw new Error(`Core migrations must be contiguous from 1; found "from: ${migration.from}" at index ${index}`)
  }
})

function readFormatVersion(manifest: unknown): number {
  const value = (manifest as { formatVersion?: unknown } | null | undefined)?.formatVersion
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('Not a versioned Automata project: manifest formatVersion must be a positive integer')
  }
  return value
}

function crossCheck(
  manifest: ProjectManifest,
  scenes: Record<string, SceneDocument>,
  resources: Record<string, ResourceDocument>
): void {
  for (const entry of manifest.scenes) {
    if (!scenes[entry.id]) throw new Error(`Manifest references missing scene "${entry.id}"`)
  }
  const sceneIds = new Set(manifest.scenes.map((entry) => entry.id))
  for (const id of Object.keys(scenes)) {
    if (!sceneIds.has(id)) throw new Error(`Scene "${id}" is not referenced by the manifest`)
  }
  for (const entry of manifest.resources) {
    const resource = resources[entry.id]
    if (!resource) throw new Error(`Manifest references missing resource "${entry.id}"`)
    if (resource.typeId !== entry.typeId) {
      throw new Error(`Resource type mismatch for "${entry.id}": manifest "${entry.typeId}" vs document "${resource.typeId}"`)
    }
  }
  const resourceIds = new Set(manifest.resources.map((entry) => entry.id))
  for (const id of Object.keys(resources)) {
    if (!resourceIds.has(id)) throw new Error(`Resource "${id}" is not referenced by the manifest`)
  }
}

/**
 * The central parse entry: version detection → core migrations → structural
 * validation → manifest/document cross-checks → optional game migration.
 */
export function parseProjectSnapshot(
  raw: RawProjectDocuments,
  opts: { migrate?: GameMigrateHook } = {}
): ParsedProject {
  const fromVersion = readFormatVersion(raw.manifest)
  if (fromVersion > PROJECT_FORMAT_VERSION) {
    throw new Error(
      `Project formatVersion ${fromVersion} is newer than this build supports (<= ${PROJECT_FORMAT_VERSION}); update the engine`
    )
  }

  let docs = raw
  for (const migration of CORE_MIGRATIONS.slice(fromVersion - 1)) docs = migration.migrate(docs)

  const manifest = projectManifestSchema.parse(docs.manifest)
  const scenes: Record<string, SceneDocument> = {}
  for (const doc of docs.scenes) {
    const scene = sceneDocumentSchema.parse(doc)
    if (scenes[scene.id]) throw new Error(`Duplicate scene id "${scene.id}"`)
    scenes[scene.id] = scene
  }
  const resources: Record<string, ResourceDocument> = {}
  for (const doc of docs.resources) {
    const resource = resourceDocumentSchema.parse(doc)
    if (resources[resource.id]) throw new Error(`Duplicate resource id "${resource.id}"`)
    resources[resource.id] = resource
  }
  crossCheck(manifest, scenes, resources)

  const snapshot = projectSnapshotSchema.parse({ manifest, scenes, resources })
  return { snapshot: applyGameMigration({ snapshot, fromVersion }, opts.migrate), fromVersion }
}

/**
 * Run a game's payload migration on an already-parsed project. No-op at the
 * current version or without a hook. The result is re-validated so a buggy
 * hook can neither smuggle malformed structure nor rebadge the project.
 */
export function applyGameMigration(parsed: ParsedProject, migrate: GameMigrateHook | undefined): ProjectSnapshot {
  if (!migrate || parsed.fromVersion >= PROJECT_FORMAT_VERSION) return parsed.snapshot
  const migrated = projectSnapshotSchema.parse(migrate(parsed.snapshot, parsed.fromVersion))
  if (migrated.manifest.gameId !== parsed.snapshot.manifest.gameId) {
    throw new Error(
      `Game migration must not change gameId ("${parsed.snapshot.manifest.gameId}" -> "${migrated.manifest.gameId}")`
    )
  }
  return migrated
}
