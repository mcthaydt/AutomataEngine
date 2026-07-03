import { z } from 'zod'
import { escapePointerToken } from './pointer'
import type { ObjectSchema, PropertySchema } from './schema'
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
