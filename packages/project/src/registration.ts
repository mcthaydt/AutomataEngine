import { validateProperty } from './schema'
import type { ObjectSchema } from './schema'
import type { ProjectSnapshot } from './model'

/**
 * Runtime-safe registration layer.
 *
 * A game describes its authoring surface declaratively — which component and
 * resource types exist, their schemas, defaults, and cardinality — plus pure
 * `validate`/`compile` functions. `defineGameProject` enforces the structural
 * invariants once, at definition time, so the editor and headless hosts can
 * trust a registration without re-checking it.
 */

/** One authoring component type a game exposes. */
export interface ComponentTypeRegistration {
  typeId: string
  label: string
  schema: ObjectSchema
  defaultData: Record<string, unknown>
  /** How many of this component an entity may carry. `max` may be `Infinity`. */
  cardinality: { min: number; max: number }
}

/** One authoring resource type a game exposes. */
export interface ResourceTypeRegistration {
  typeId: string
  label: string
  schema: ObjectSchema
  defaultData: Record<string, unknown>
  /** When true, exactly one document of this type may exist in a project. */
  singleton?: boolean
}

/** A located, severity-tagged issue produced by structural/game validation. */
export interface ValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  sceneId?: string
  entityId?: string
  componentId?: string
  resourceId?: string
  pointer?: string
}

/** The full, game-agnostic definition of an authorable project type. */
export interface GameProjectDefinition<Compiled> {
  gameId: string
  label: string
  components: ComponentTypeRegistration[]
  resources: ResourceTypeRegistration[]
  /** Produce a fresh, valid project for "new project". */
  createTemplate: () => ProjectSnapshot
  /** Game-specific structural validation beyond schema/registration checks. */
  validate: (snapshot: ProjectSnapshot) => ValidationIssue[]
  /** Pure transform from a validated snapshot to the game's runtime config. */
  compile: (snapshot: ProjectSnapshot) => Compiled
}

/**
 * Validate a registration's structural invariants and return it unchanged.
 * Throws on the first violation: empty/duplicate type IDs, bad cardinality,
 * defaults that fail their own schema, or a template whose `gameId` mismatches.
 */
export function defineGameProject<Compiled>(definition: GameProjectDefinition<Compiled>): GameProjectDefinition<Compiled> {
  if (!definition.gameId) throw new Error('defineGameProject: gameId must be non-empty')

  assertUniqueTypes(definition.components, 'component')
  for (const component of definition.components) {
    const { min, max } = component.cardinality
    if (min < 0 || max < min) {
      throw new Error(`defineGameProject: invalid cardinality for component "${component.typeId}" (min ${min}, max ${max})`)
    }
    assertValidDefault('component', component.typeId, component.schema, component.defaultData)
  }

  assertUniqueTypes(definition.resources, 'resource')
  for (const resource of definition.resources) {
    assertValidDefault('resource', resource.typeId, resource.schema, resource.defaultData)
  }

  const template = definition.createTemplate()
  if (template.manifest.gameId !== definition.gameId) {
    throw new Error(`defineGameProject: template gameId "${template.manifest.gameId}" does not match registration "${definition.gameId}"`)
  }

  return definition
}

function assertUniqueTypes(entries: ReadonlyArray<{ typeId: string }>, label: string): void {
  const seen = new Set<string>()
  for (const entry of entries) {
    if (!entry.typeId) throw new Error(`defineGameProject: ${label} type id must be non-empty`)
    if (seen.has(entry.typeId)) throw new Error(`defineGameProject: duplicate ${label} type id "${entry.typeId}"`)
    seen.add(entry.typeId)
  }
}

function assertValidDefault(label: string, typeId: string, schema: ObjectSchema, defaultData: Record<string, unknown>): void {
  const issues = validateProperty(schema, defaultData)
  if (issues.length > 0) {
    const detail = issues.map((issue) => `${issue.pointer || '/'} ${issue.code}`).join(', ')
    throw new Error(`defineGameProject: invalid default for ${label} "${typeId}": ${detail}`)
  }
}
