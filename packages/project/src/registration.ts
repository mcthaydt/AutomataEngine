import { z } from 'zod'
import { validateProperty } from './schema'
import type { ObjectSchema, PropertyIssue } from './schema'
import type { ProjectDataSchema } from './authoring'
import { deriveObjectSchema, validateDataSchema } from './derive'
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

/**
 * Declarative viewport gizmo for a component. Pure data (no editor dependency):
 * a `point` gizmo marks an entity placeable/visible even without a primitive; a
 * `zone` gizmo is drawn translucently from the component's own dimensions.
 */
export interface ComponentGizmo {
  kind: 'point' | 'zone'
  /** Editor-only display color; the viewport falls back to a default. */
  color?: string
  /** Point gizmo radius in world units. */
  size?: number
}

/** One authoring component type a game exposes. */
export interface ComponentTypeRegistration {
  typeId: string
  label: string
  /** Derived editor IR. Populated by normalization; consumers read this. */
  schema: ObjectSchema
  /** Authored zod schema — the validation source of truth when present. */
  dataSchema?: ProjectDataSchema
  /** `z.toJSONSchema(dataSchema)`, precomputed for MCP tool descriptions. */
  jsonSchema?: Record<string, unknown>
  defaultData: Record<string, unknown>
  /** How many of this component an entity may carry. `max` may be `Infinity`. */
  cardinality: { min: number; max: number }
  /** Optional viewport gizmo so the generic editor can place/draw the entity. */
  gizmo?: ComponentGizmo
}

/** One authoring resource type a game exposes. */
export interface ResourceTypeRegistration {
  typeId: string
  label: string
  /** Derived editor IR. Populated by normalization; consumers read this. */
  schema: ObjectSchema
  /** Authored zod schema — the validation source of truth when present. */
  dataSchema?: ProjectDataSchema
  /** `z.toJSONSchema(dataSchema)`, precomputed for MCP tool descriptions. */
  jsonSchema?: Record<string, unknown>
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

/** Authoring-time spec: `schema` may be the legacy DSL or a zod object. */
export type ComponentTypeInput = Omit<ComponentTypeRegistration, 'schema' | 'dataSchema' | 'jsonSchema'> & {
  schema: ObjectSchema | ProjectDataSchema
}
export type ResourceTypeInput = Omit<ResourceTypeRegistration, 'schema' | 'dataSchema' | 'jsonSchema'> & {
  schema: ObjectSchema | ProjectDataSchema
}

export type GameProjectDefinitionInput<Compiled> = Omit<GameProjectDefinition<Compiled>, 'components' | 'resources'> & {
  components: ComponentTypeInput[]
  resources: ResourceTypeInput[]
}

function isDataSchema(schema: ObjectSchema | ProjectDataSchema): schema is ProjectDataSchema {
  return schema instanceof z.ZodType
}

/** Normalize one authored component spec: zod → derived IR + JSON schema. */
export function normalizeComponentType(input: ComponentTypeInput): ComponentTypeRegistration {
  if (!isDataSchema(input.schema)) return input as ComponentTypeRegistration
  const { schema, ...rest } = input
  return {
    ...rest,
    schema: deriveObjectSchema(schema),
    dataSchema: schema,
    jsonSchema: z.toJSONSchema(schema) as Record<string, unknown>
  }
}

/** Normalize one authored resource spec: zod → derived IR + JSON schema. */
export function normalizeResourceType(input: ResourceTypeInput): ResourceTypeRegistration {
  if (!isDataSchema(input.schema)) return input as ResourceTypeRegistration
  const { schema, ...rest } = input
  return {
    ...rest,
    schema: deriveObjectSchema(schema),
    dataSchema: schema,
    jsonSchema: z.toJSONSchema(schema) as Record<string, unknown>
  }
}

/** Validate a data record against a spec — zod when authored, DSL fallback otherwise. */
export function validateSpecData(
  spec: { schema: ObjectSchema; dataSchema?: ProjectDataSchema },
  value: unknown
): PropertyIssue[] {
  return spec.dataSchema
    ? validateDataSchema(spec.dataSchema, spec.schema, value)
    : validateProperty(spec.schema, value)
}

/**
 * Validate a registration's structural invariants and return it unchanged.
 * Throws on the first violation: empty/duplicate type IDs, bad cardinality,
 * defaults that fail their own schema, or a template whose `gameId` mismatches.
 */
export function defineGameProject<Compiled>(input: GameProjectDefinitionInput<Compiled>): GameProjectDefinition<Compiled> {
  if (!input.gameId) throw new Error('defineGameProject: gameId must be non-empty')

  const definition: GameProjectDefinition<Compiled> = {
    ...input,
    components: input.components.map(normalizeComponentType),
    resources: input.resources.map(normalizeResourceType)
  }

  assertUniqueTypes(definition.components, 'component')
  for (const component of definition.components) {
    const { min, max } = component.cardinality
    if (min < 0 || max < min) {
      throw new Error(`defineGameProject: invalid cardinality for component "${component.typeId}" (min ${min}, max ${max})`)
    }
    assertValidDefault('component', component.typeId, component, component.defaultData)
  }

  assertUniqueTypes(definition.resources, 'resource')
  for (const resource of definition.resources) {
    assertValidDefault('resource', resource.typeId, resource, resource.defaultData)
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

function assertValidDefault(
  label: string,
  typeId: string,
  spec: { schema: ObjectSchema; dataSchema?: ProjectDataSchema },
  defaultData: Record<string, unknown>
): void {
  const issues = validateSpecData(spec, defaultData)
  if (issues.length > 0) {
    const detail = issues.map((issue) => `${issue.pointer || '/'} ${issue.code}`).join(', ')
    throw new Error(`defineGameProject: invalid default for ${label} "${typeId}": ${detail}`)
  }
}
