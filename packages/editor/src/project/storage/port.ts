import type { ProjectSnapshot, ValidationIssue } from '@automata/project'

/**
 * Storage abstraction for a project workspace.
 *
 * A `ProjectStoragePort` opens a snapshot, saves only the dirty document paths
 * (reporting per-path success/failure), and exports/imports a single-file
 * bundle. Concrete adapters (memory, File System Access, bundle download) all
 * satisfy this so the editor app never branches on the backing store.
 */
export interface ProjectSaveResult {
  saved: string[]
  failed: Array<{ path: string; message: string }>
}

export interface ProjectStorageCapabilities {
  /** True when the adapter can persist individual files (folder access). */
  canSaveFolder: boolean
  /** True when the adapter can export/import single-file bundles. */
  canExportBundle: boolean
}

export interface ProjectBundleExport {
  text: string
  /** Current game validation issues; export still succeeds for parseable snapshots. */
  issues: ValidationIssue[]
}

export interface ProjectStoragePort {
  readonly capabilities: ProjectStorageCapabilities
  open(): Promise<ProjectSnapshot>
  save(snapshot: ProjectSnapshot, dirtyPaths: readonly string[]): Promise<ProjectSaveResult>
  exportBundle(snapshot: ProjectSnapshot): ProjectBundleExport
  importBundle(text: string): ProjectSnapshot
}

/** Optional validator so `exportBundle` can attach current issues. */
export interface ProjectStorageValidation {
  validate?: (snapshot: ProjectSnapshot) => ValidationIssue[]
}
