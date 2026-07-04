/**
 * The finite, closed property-descriptor IR.
 *
 * Schemas are authored in zod (see `authoring.ts`) and `derive.ts` produces
 * these descriptors from them at registration time; the editor generates
 * controls from the IR, and validation runs through zod (`validateSpecData`).
 * The language is intentionally small and closed: every kind here maps to
 * exactly one generated control, so no game can smuggle bespoke UI into the
 * generic editor.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
