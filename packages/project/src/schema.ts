/**
 * The finite, declarative property-schema language.
 *
 * Registrations describe component/resource data with these schemas; the editor
 * generates controls from them, and `validateProperty` checks authored values
 * against them. The language is intentionally small and closed: every kind here
 * maps to exactly one generated control, so no game can smuggle bespoke UI into
 * the generic editor.
 *
 * Common metadata (`key`, `label`, `description`, `required`) is optional at the
 * type level because the same node shape is reused in three positions: as a
 * top-level object/array schema (no key/label), as a keyed field inside an
 * object (key/label present), and as an array's item type (no key/label).
 */

/** Metadata shared by every property; present on object fields, omitted at roots. */
export interface CommonProperty {
  key?: string
  label?: string
  description?: string
  required?: boolean
}

export interface NumberProperty extends CommonProperty {
  kind: 'number'
  min?: number
  max?: number
  step?: number
}

export interface StringProperty extends CommonProperty {
  kind: 'string'
  multiline?: boolean
}

export interface BooleanProperty extends CommonProperty {
  kind: 'boolean'
}

export interface EnumProperty extends CommonProperty {
  kind: 'enum'
  values: readonly string[]
}

export interface ColorProperty extends CommonProperty {
  kind: 'color'
}

export interface Vec3Property extends CommonProperty {
  kind: 'vec3'
}

export interface ReferenceProperty extends CommonProperty {
  kind: 'reference'
  /** What the reference points at; resolution happens in `validation.ts`. */
  target: 'entity' | 'resource'
  /** When set, only resources/entities of these type IDs are eligible. */
  typeIds?: readonly string[]
}

export interface ObjectProperty extends CommonProperty {
  kind: 'object'
  fields: readonly PropertySchema[]
}

export interface ArrayProperty extends CommonProperty {
  kind: 'array'
  item: PropertySchema
  presentation: 'list' | 'table'
  minItems?: number
  maxItems?: number
}

/** The closed discriminated union of every supported property kind. */
export type PropertySchema =
  | NumberProperty
  | StringProperty
  | BooleanProperty
  | EnumProperty
  | ColorProperty
  | Vec3Property
  | ReferenceProperty
  | ObjectProperty
  | ArrayProperty

/** Top-level schema for a component/resource data record. */
export type ObjectSchema = ObjectProperty

/** A single validation failure located by RFC 6901 JSON Pointer. */
export interface PropertyIssue {
  code: string
  message: string
  pointer: string
}

const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/** Escape a single JSON Pointer reference token per RFC 6901 (`~`→`~0`, `/`→`~1`). */
function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteVec3(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (['x', 'y', 'z'] as const).every((axis) => typeof value[axis] === 'number' && Number.isFinite(value[axis]))
}

/**
 * Validate `value` against `schema`, returning every issue with its JSON Pointer.
 * Recurses into objects/arrays, rejects unknown object keys, enforces required
 * fields, numeric ranges, enum membership, color format, and array bounds.
 * References are only checked to be non-empty strings here; cross-document
 * resolution is a higher layer's job.
 */
export function validateProperty(schema: ObjectSchema | PropertySchema, value: unknown, pointer = ''): PropertyIssue[] {
  switch (schema.kind) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return [{ code: 'number.type', message: 'Expected a finite number', pointer }]
      }
      if (schema.min !== undefined && value < schema.min) {
        return [{ code: 'number.min', message: `Must be ≥ ${schema.min}`, pointer }]
      }
      if (schema.max !== undefined && value > schema.max) {
        return [{ code: 'number.max', message: `Must be ≤ ${schema.max}`, pointer }]
      }
      return []
    }
    case 'string':
      return typeof value === 'string' ? [] : [{ code: 'string.type', message: 'Expected a string', pointer }]
    case 'boolean':
      return typeof value === 'boolean' ? [] : [{ code: 'boolean.type', message: 'Expected a boolean', pointer }]
    case 'enum':
      return typeof value === 'string' && schema.values.includes(value)
        ? []
        : [{ code: 'enum.value', message: `Must be one of ${schema.values.join(', ')}`, pointer }]
    case 'color': {
      if (typeof value !== 'string') return [{ code: 'color.type', message: 'Expected a color string', pointer }]
      return COLOR_RE.test(value) ? [] : [{ code: 'color.format', message: 'Expected a #hex color', pointer }]
    }
    case 'vec3':
      return isFiniteVec3(value) ? [] : [{ code: 'vec3.type', message: 'Expected { x, y, z } numbers', pointer }]
    case 'reference': {
      if (typeof value !== 'string') return [{ code: 'reference.type', message: 'Expected a reference id string', pointer }]
      if (value === '') return schema.required ? [{ code: 'reference.empty', message: 'A reference is required', pointer }] : []
      return []
    }
    case 'object':
      return validateObject(schema, value, pointer)
    case 'array':
      return validateArray(schema, value, pointer)
  }
}

function validateObject(schema: ObjectProperty, value: unknown, pointer: string): PropertyIssue[] {
  if (!isRecord(value)) return [{ code: 'object.type', message: 'Expected an object', pointer }]
  const issues: PropertyIssue[] = []
  const known = new Set<string>()
  for (const field of schema.fields) {
    if (field.key === undefined) continue
    known.add(field.key)
    const childPointer = `${pointer}/${escapeToken(field.key)}`
    const present = field.key in value && value[field.key] !== undefined
    if (!present) {
      if (field.required) issues.push({ code: 'required', message: `${field.label ?? field.key} is required`, pointer: childPointer })
      continue
    }
    issues.push(...validateProperty(field, value[field.key], childPointer))
  }
  for (const key of Object.keys(value)) {
    if (!known.has(key)) issues.push({ code: 'object.unknownKey', message: `Unknown key "${key}"`, pointer: `${pointer}/${escapeToken(key)}` })
  }
  return issues
}

function validateArray(schema: ArrayProperty, value: unknown, pointer: string): PropertyIssue[] {
  if (!Array.isArray(value)) return [{ code: 'array.type', message: 'Expected an array', pointer }]
  const issues: PropertyIssue[] = []
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    issues.push({ code: 'array.minItems', message: `Expected at least ${schema.minItems} item(s)`, pointer })
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    issues.push({ code: 'array.maxItems', message: `Expected at most ${schema.maxItems} item(s)`, pointer })
  }
  value.forEach((item, index) => issues.push(...validateProperty(schema.item, item, `${pointer}/${index}`)))
  return issues
}

/** Build a complete default value record for an object schema, field by field. */
export function defaultObject(schema: ObjectSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of schema.fields) {
    if (field.key === undefined) continue
    out[field.key] = defaultValue(field)
  }
  return out
}

/**
 * Walk a schema/value pair and collect every non-empty reference id whose
 * field targets `target` ('entity' or 'resource'). Used for reference
 * resolution during validation and referenced-document removal protection.
 */
export function collectReferences(schema: ObjectSchema | PropertySchema, value: unknown, target: 'entity' | 'resource'): string[] {
  const out: string[] = []
  const walk = (node: PropertySchema, current: unknown): void => {
    switch (node.kind) {
      case 'reference':
        if (node.target === target && typeof current === 'string' && current !== '') out.push(current)
        return
      case 'object':
        if (!isRecord(current)) return
        for (const field of node.fields) {
          if (field.key !== undefined && field.key in current) walk(field, current[field.key])
        }
        return
      case 'array':
        if (!Array.isArray(current)) return
        for (const item of current) walk(node.item, item)
        return
      default:
        return
    }
  }
  walk(schema, value)
  return out
}

function defaultValue(schema: PropertySchema): unknown {
  switch (schema.kind) {
    case 'number': return schema.min ?? 0
    case 'string': return ''
    case 'boolean': return false
    case 'enum': return schema.values[0] ?? ''
    case 'color': return '#ffffff'
    case 'vec3': return { x: 0, y: 0, z: 0 }
    case 'reference': return ''
    case 'object': return defaultObject(schema)
    case 'array': return []
  }
}
