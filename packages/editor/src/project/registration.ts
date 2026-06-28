import type { PhysicsPort, RenderPort } from '@automata/engine'
import {
  CORE_COMPONENTS, validateProject, validateProperty,
  type ComponentTypeRegistration, type GameProjectDefinition,
  type ProjectSnapshot, type ResourceTypeRegistration, type ValidationIssue
} from '@automata/project'

/**
 * The browser/headless registration boundary.
 *
 * `EditorProjectRegistration<Compiled>` is what a game exports for the editor: a
 * runtime-safe project definition plus editor-only adapters (prefabs, live
 * preview, headless evaluation). `registerEditorProject` validates the prefabs
 * and returns a non-generic `RegisteredEditorProject` whose closures keep the
 * concrete `Compiled` type internally so editor, agent, and MCP can all hold one
 * type-erased handle.
 */

/** Live in-viewport gameplay handle (mirrors the legacy PlayHandle shape). */
export interface ProjectPlayHandle {
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt?: number): void
  dispose(): void
}

/** Creates a play handle from compiled project data for in-editor preview. */
export interface ProjectPreviewAdapter<Compiled> {
  create(compiled: Compiled, sceneId: string, render: RenderPort, physics: PhysicsPort): ProjectPlayHandle
}

/** Normalized, game-agnostic headless evaluation outcome. */
export interface ProjectEvaluationResult {
  outcome: 'passed' | 'failed' | 'incomplete'
  score: number
  metrics: Record<string, number | string | boolean>
  steps: number
}

/** Runs a headless evaluation directly from an (unsaved) snapshot. */
export interface ProjectEvaluationAdapter {
  evaluate(snapshot: ProjectSnapshot, opts: { maxSteps: number }): Promise<ProjectEvaluationResult>
}

/** A named entity template the palette can place into a scene. */
export interface PrefabRegistration {
  id: string
  label: string
  components: Array<{ typeId: string; data: Record<string, unknown> }>
}

/** What a game exports for the editor. */
export interface EditorProjectRegistration<Compiled> {
  project: GameProjectDefinition<Compiled>
  prefabs: PrefabRegistration[]
  preview?: ProjectPreviewAdapter<Compiled>
  evaluation?: ProjectEvaluationAdapter
}

/** Type-erased registration the editor session, agent, and MCP share. */
export interface RegisteredEditorProject {
  gameId: string
  label: string
  project: GameProjectDefinition<unknown>
  /** Core + game component types, in stable display order. */
  componentTypes: ComponentTypeRegistration[]
  resourceTypes: ResourceTypeRegistration[]
  prefabs: PrefabRegistration[]
  createTemplate(): ProjectSnapshot
  compile(snapshot: ProjectSnapshot): unknown
  validate(snapshot: ProjectSnapshot): ValidationIssue[]
  createPreview?(compiled: unknown, sceneId: string, render: RenderPort, physics: PhysicsPort): ProjectPlayHandle
  evaluate?(snapshot: ProjectSnapshot, opts: { maxSteps: number }): Promise<ProjectEvaluationResult>
}

/** Validate prefabs and erase the compiled type behind stable closures. */
export function registerEditorProject<Compiled>(registration: EditorProjectRegistration<Compiled>): RegisteredEditorProject {
  const { project, prefabs, preview, evaluation } = registration
  const componentTypes = [...CORE_COMPONENTS, ...project.components]
  const byTypeId = new Map(componentTypes.map((component) => [component.typeId, component]))

  const seen = new Set<string>()
  for (const prefab of prefabs) {
    if (seen.has(prefab.id)) throw new Error(`registerEditorProject: duplicate prefab id "${prefab.id}"`)
    seen.add(prefab.id)
    for (const component of prefab.components) {
      const componentType = byTypeId.get(component.typeId)
      if (!componentType) throw new Error(`registerEditorProject: prefab "${prefab.id}" uses unknown component "${component.typeId}"`)
      const issues = validateProperty(componentType.schema, component.data)
      if (issues.length > 0) {
        throw new Error(`registerEditorProject: prefab "${prefab.id}" has invalid default for "${component.typeId}": ${issues.map((issue) => issue.code).join(', ')}`)
      }
    }
  }

  return {
    gameId: project.gameId,
    label: project.label,
    project: project as GameProjectDefinition<unknown>,
    componentTypes,
    resourceTypes: project.resources,
    prefabs,
    createTemplate: () => project.createTemplate(),
    compile: (snapshot) => project.compile(snapshot),
    validate: (snapshot) => validateProject(project, snapshot),
    createPreview: preview ? (compiled, sceneId, render, physics) => preview.create(compiled as Compiled, sceneId, render, physics) : undefined,
    evaluate: evaluation ? (snapshot, opts) => evaluation.evaluate(snapshot, opts) : undefined
  }
}
