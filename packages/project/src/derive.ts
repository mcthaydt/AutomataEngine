import { z } from 'zod'
import { escapePointerToken } from './pointer'
import type { ObjectSchema, PropertyIssue, PropertySchema } from './schema'
import type { AutomataMeta, ProjectDataSchema, ProjectFieldMeta } from './authoring'

/**
 * Derive the closed editor IR (`PropertySchema`) from an authored zod schema.
 *
 * The IR survives as a derived artifact so the editor UI and the reference
 * walkers keep one small, stable shape; this module is the single place that
 * touches zod internals. Anything outside the supported table fails loudly at
 * registration time — the property language stays closed.
 */

export class SchemaDeriveError extends Error {
  constructor(message: string, readonly path: string) {
    super(`derive: ${message} at "${path || '/'}"`)
    this.name = 'SchemaDeriveError'
  }
}

interface FieldMeta extends ProjectFieldMeta {
  automata?: AutomataMeta
}

function metaOf(schema: z.ZodType): FieldMeta {
  return (schema.meta() ?? {}) as FieldMeta
}

function unwrapOptional(schema: z.ZodType): { inner: z.ZodType; required: boolean; meta: FieldMeta } {
  let inner = schema
  let required = true
  let meta = metaOf(schema)
  while (inner.def.type === 'optional') {
    required = false
    inner = (inner as z.ZodOptional<z.ZodType>).unwrap()
    // Inner layers take precedence so helper-attached `automata` markers can
    // never be clobbered; wrapper-only keys (e.g. `.optional().meta({...})`) survive.
    meta = { ...meta, ...metaOf(inner) }
  }
  return { inner, required, meta }
}

/** Derive the object-root IR for one component/resource data schema. */
export function deriveObjectSchema(dataSchema: ProjectDataSchema): ObjectSchema {
  const root = deriveNode(dataSchema, '')
  if (root.kind !== 'object') {
    throw new SchemaDeriveError('component/resource schemas must be zod objects', '')
  }
  return root
}

function deriveNode(schema: z.ZodType, path: string, meta: FieldMeta = metaOf(schema)): PropertySchema {
  const common = {
    ...(meta.label !== undefined ? { label: meta.label } : {}),
    ...(meta.description !== undefined ? { description: meta.description } : {})
  }
  const marker = meta.automata

  switch (schema.def.type) {
    case 'number': {
      const number = schema as z.ZodNumber
      // `minValue`/`maxValue` merge inclusive and exclusive bounds
      // indistinguishably; the bag keeps them apart. Verified against the
      // installed zod: `z.number().gt(0)._zod.bag` is `{ exclusiveMinimum: 0 }`.
      const bag = (number as unknown as {
        _zod: { bag: { exclusiveMinimum?: number; exclusiveMaximum?: number } }
      })._zod.bag
      if (bag.exclusiveMinimum !== undefined || bag.exclusiveMaximum !== undefined) {
        throw new SchemaDeriveError(
          'exclusive number bounds (.gt/.lt/.positive/.negative) are not supported; use .min()/.max()',
          path
        )
      }
      return {
        kind: 'number',
        ...common,
        ...(number.minValue !== null && number.minValue !== -Infinity ? { min: number.minValue } : {}),
        ...(number.maxValue !== null && number.maxValue !== Infinity ? { max: number.maxValue } : {}),
        ...(meta.step !== undefined ? { step: meta.step } : {})
      }
    }
    case 'string': {
      if (marker?.kind === 'color') return { kind: 'color', ...common }
      if (marker?.kind === 'reference') {
        return {
          kind: 'reference',
          ...common,
          target: marker.target,
          ...(marker.typeIds ? { typeIds: marker.typeIds } : {})
        }
      }
      return { kind: 'string', ...common, ...(meta.multiline ? { multiline: true } : {}) }
    }
    case 'boolean':
      return { kind: 'boolean', ...common }
    case 'enum':
      return {
        kind: 'enum',
        ...common,
        values: (schema as unknown as { options: string[] }).options
      }
    case 'object': {
      if (marker?.kind === 'vec3') return { kind: 'vec3', ...common }
      const catchall = (schema as unknown as { def: { catchall?: z.ZodType } }).def.catchall
      if (catchall?.def.type !== 'never') {
        throw new SchemaDeriveError('objects must be authored with z.strictObject(...)', path)
      }
      const shape = (schema as ProjectDataSchema).shape
      const fields = Object.entries(shape).map(([key, field]) => {
        const { inner, required, meta: fieldMeta } = unwrapOptional(field as z.ZodType)
        const node = deriveNode(inner, `${path}/${escapePointerToken(key)}`, fieldMeta)
        return { ...node, key, required }
      })
      return { kind: 'object', ...common, fields }
    }
    case 'array': {
      if (marker?.kind !== 'array') {
        throw new SchemaDeriveError('arrays must be authored with listOf(...) or tableOf(...)', path)
      }
      const element = (schema as unknown as { element: z.ZodType }).element
      return {
        kind: 'array',
        ...common,
        presentation: marker.presentation,
        item: deriveNode(element, `${path}/*`),
        ...(marker.minItems !== undefined ? { minItems: marker.minItems } : {}),
        ...(marker.maxItems !== undefined ? { maxItems: marker.maxItems } : {})
      }
    }
    default:
      throw new SchemaDeriveError(`unsupported zod construct "${schema.def.type}"`, path)
  }
}

/**
 * Validate through zod (the source of truth) and translate the issues into
 * the editor's `PropertyIssue` shape: same codes, messages, and JSON
 * pointers the DSL validator produced, so no downstream consumer churns.
 */
export function validateDataSchema(
  dataSchema: ProjectDataSchema,
  ir: ObjectSchema,
  value: unknown
): PropertyIssue[] {
  const result = dataSchema.safeParse(value)
  const issues = result.success ? [] : mapZodIssues(ir, value, result.error.issues)
  issues.push(...emptyRequiredReferences(ir, value, ''))
  return issues
}

type ZodIssueLike = {
  code: string
  path: PropertyKey[]
  keys?: string[]
  message: string
}

const TYPE_CODES: Record<PropertySchema['kind'], { code: string; message: string }> = {
  number: { code: 'number.type', message: 'Expected a finite number' },
  string: { code: 'string.type', message: 'Expected a string' },
  boolean: { code: 'boolean.type', message: 'Expected a boolean' },
  enum: { code: 'enum.value', message: 'Value is not one of the allowed options' },
  color: { code: 'color.type', message: 'Expected a color string' },
  vec3: { code: 'vec3.type', message: 'Expected { x, y, z } numbers' },
  reference: { code: 'reference.type', message: 'Expected a reference id string' },
  object: { code: 'object.type', message: 'Expected an object' },
  array: { code: 'array.type', message: 'Expected an array' }
}

/** Walk the IR along a zod issue path; collapse when a vec3 node is crossed. */
function locate(ir: ObjectSchema, path: PropertyKey[]): { node: PropertySchema | undefined; pointer: string; collapsed: boolean } {
  let node: PropertySchema | undefined = ir
  let pointer = ''
  for (const segment of path) {
    if (node?.kind === 'vec3') return { node, pointer, collapsed: true }
    if (node?.kind === 'object') {
      node = node.fields.find((field) => field.key === String(segment))
    } else if (node?.kind === 'array') {
      node = node.item
    } else {
      node = undefined
    }
    pointer = `${pointer}/${escapePointerToken(String(segment))}`
  }
  return { node, pointer, collapsed: false }
}

function valueAt(root: unknown, path: PropertyKey[]): unknown {
  let current: unknown = root
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<PropertyKey, unknown>)[segment]
  }
  return current
}

/**
 * True when a zod issue at `path` reflects an absent key rather than a
 * wrong-typed value. Needed for both `invalid_type` (the common case) and
 * `invalid_value` (zod reports a missing enum field the same way as an
 * out-of-range one — `invalid_value`, not `invalid_type` — but the DSL
 * treats a missing required field as `required` regardless of kind).
 */
function isMissing(root: unknown, path: PropertyKey[]): boolean {
  if (path.length === 0) return false
  const parent = valueAt(root, path.slice(0, -1))
  const key = path[path.length - 1]
  return (
    parent !== null && typeof parent === 'object' && !Array.isArray(parent) &&
    (!(String(key) in (parent as Record<string, unknown>)) ||
      (parent as Record<string, unknown>)[String(key)] === undefined)
  )
}

function mapZodIssues(ir: ObjectSchema, root: unknown, zodIssues: readonly ZodIssueLike[]): PropertyIssue[] {
  const out: PropertyIssue[] = []
  const seen = new Set<string>()
  const push = (issue: PropertyIssue): void => {
    const key = `${issue.code}@${issue.pointer}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(issue)
  }

  for (const issue of zodIssues) {
    const { node, pointer, collapsed } = locate(ir, issue.path)

    if (collapsed || (node?.kind === 'vec3' && issue.code !== 'invalid_type' && issue.code !== 'unrecognized_keys')) {
      push({ code: 'vec3.type', message: TYPE_CODES.vec3.message, pointer })
      continue
    }

    switch (issue.code) {
      case 'unrecognized_keys':
        for (const key of issue.keys ?? []) {
          push({ code: 'object.unknownKey', message: `Unknown key "${key}"`, pointer: `${pointer}/${escapePointerToken(key)}` })
        }
        break
      case 'invalid_type': {
        if (isMissing(root, issue.path)) {
          const key = issue.path[issue.path.length - 1]
          push({ code: 'required', message: `${node?.label ?? String(key)} is required`, pointer })
          break
        }
        const mapped = node ? TYPE_CODES[node.kind] : TYPE_CODES.object
        push({ code: mapped.code, message: mapped.message, pointer })
        break
      }
      case 'invalid_value':
        if (isMissing(root, issue.path)) {
          const key = issue.path[issue.path.length - 1]
          push({ code: 'required', message: `${node?.label ?? String(key)} is required`, pointer })
          break
        }
        push({
          code: 'enum.value',
          message: node?.kind === 'enum' ? `Must be one of ${node.values.join(', ')}` : TYPE_CODES.enum.message,
          pointer
        })
        break
      case 'too_small':
        if (node?.kind === 'array') {
          push({ code: 'array.minItems', message: `Expected at least ${node.minItems} item(s)`, pointer })
        } else {
          push({ code: 'number.min', message: `Must be ≥ ${node?.kind === 'number' ? node.min : ''}`.trimEnd(), pointer })
        }
        break
      case 'too_big':
        if (node?.kind === 'array') {
          push({ code: 'array.maxItems', message: `Expected at most ${node.maxItems} item(s)`, pointer })
        } else {
          push({ code: 'number.max', message: `Must be ≤ ${node?.kind === 'number' ? node.max : ''}`.trimEnd(), pointer })
        }
        break
      case 'invalid_format':
        push({ code: 'color.format', message: 'Expected a #hex color', pointer })
        break
      default:
        push({ code: issue.code, message: issue.message, pointer })
    }
  }
  return out
}

/** DSL semantic preserved post-parse: a required reference may not be ''. */
function emptyRequiredReferences(node: PropertySchema, value: unknown, pointer: string): PropertyIssue[] {
  switch (node.kind) {
    case 'reference':
      return node.required === true && value === ''
        ? [{ code: 'reference.empty', message: 'A reference is required', pointer }]
        : []
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
      const record = value as Record<string, unknown>
      return node.fields.flatMap((field) =>
        field.key !== undefined && field.key in record
          ? emptyRequiredReferences(field, record[field.key], `${pointer}/${escapePointerToken(field.key)}`)
          : []
      )
    }
    case 'array':
      return Array.isArray(value)
        ? value.flatMap((item, index) => emptyRequiredReferences(node.item, item, `${pointer}/${index}`))
        : []
    default:
      return []
  }
}
