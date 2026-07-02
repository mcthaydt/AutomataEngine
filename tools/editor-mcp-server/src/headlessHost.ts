import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createProjectToolHost,
  type EditorProjectToolHost,
  type RegisteredEditorProject
} from '@automata/editor/headless'
import {
  loadProjectFiles,
  parseProjectBundle,
  type ProjectSnapshot
} from '@automata/project'
import { loadProjectRegistration } from './projectCatalog'
import { createProjectDirectoryReader } from './projectReader'

/** src -> package -> tools -> repository root -> default shipped project. */
const DEFAULT_PROJECT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../games/monkey-ball/public/project'
)

export interface HeadlessHostOptions {
  projectDir?: string
  bundleJson?: string
  baseline?: unknown
  /** Overrides the monorepo root used for game discovery (tests, clones). */
  repoRoot?: string
}

export interface HeadlessHost {
  host: EditorProjectToolHost
  registration: RegisteredEditorProject
  snapshot: ProjectSnapshot
}

/** Load, register, validate, and isolate one persisted game project. */
export async function createHeadlessHost(options: HeadlessHostOptions = {}): Promise<HeadlessHost> {
  if (options.projectDir !== undefined && options.bundleJson !== undefined) {
    throw new Error('Provide exactly one project source: projectDir or bundleJson')
  }

  const snapshot = options.bundleJson !== undefined
    ? parseProjectBundle(options.bundleJson)
    : await loadProjectFiles(createProjectDirectoryReader(options.projectDir ?? DEFAULT_PROJECT_DIR))
  const registration = await loadProjectRegistration(snapshot.manifest.gameId, options.repoRoot)
  const errors = registration.validate(snapshot).filter((issue) => issue.severity === 'error')
  if (errors.length > 0) {
    throw new Error(
      `Invalid project "${snapshot.manifest.id}": ${errors.map((issue) => issue.code).join(', ')}`
    )
  }

  return {
    snapshot,
    registration,
    host: createProjectToolHost({
      registration,
      initialSnapshot: snapshot,
      baseline: options.baseline
    })
  }
}
