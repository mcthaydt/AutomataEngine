import { z } from 'zod'

/**
 * Zod authoring surface for component/resource data schemas.
 *
 * Plain zod covers scalars (`z.number().min(0)`, `z.string()`, `z.boolean()`,
 * `z.enum([...])`). The helpers below cover the kinds the editor needs to
 * recognize structurally; each attaches a closed `automata` marker via
 * `.meta()` that `derive.ts` reads. Never call `.meta()` on a helper result —
 * it would replace the registered metadata and lose the marker; pass
 * label/description as arguments instead.
 */

/**
 * Games author schemas with this `z`, re-exported here because game and
 * editor code may not import third-party packages directly (lint-enforced);
 * @automata/project is the wrap point for the schema language the way
 * @automata/engine is for rendering/physics.
 */
export { z } from 'zod'

/** A zod object schema authored for one component/resource data record. */
export type ProjectDataSchema = z.ZodObject<z.ZodRawShape>

/** Editor metadata carried on a field via `.meta()`. */
export interface ProjectFieldMeta {
  label?: string
  description?: string
  /** Number input step. */
  step?: number
  /** Render a string as a multiline textarea. */
  multiline?: boolean
}

/** The closed marker vocabulary the deriver recognizes under `.meta().automata`. */
export type AutomataMeta =
  | { kind: 'vec3' }
  | { kind: 'color' }
  | { kind: 'reference'; target: 'entity' | 'resource'; typeIds?: readonly string[] }
  | { kind: 'array'; presentation: 'list' | 'table'; minItems?: number; maxItems?: number }

/** 3/4/6/8-digit #hex colors — same grammar the DSL validator enforced. */
export const PROJECT_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/** Strict `{ x, y, z }` of numbers, rendered as the vec3 control. */
export function vec3(meta: ProjectFieldMeta = {}) {
  return z
    .strictObject({ x: z.number(), y: z.number(), z: z.number() })
    .meta({ ...meta, automata: { kind: 'vec3' } satisfies AutomataMeta })
}

/** `#hex` color string, rendered as the color control. */
export function color(meta: ProjectFieldMeta = {}) {
  return z
    .string()
    .regex(PROJECT_COLOR_RE)
    .meta({ ...meta, automata: { kind: 'color' } satisfies AutomataMeta })
}

/** Reference id string; resolution semantics live in `validation.ts`. */
export function reference(
  opts: { target: 'entity' | 'resource'; typeIds?: readonly string[] } & ProjectFieldMeta
) {
  const { target, typeIds, ...meta } = opts
  return z.string().meta({
    ...meta,
    automata: { kind: 'reference', target, ...(typeIds ? { typeIds } : {}) } satisfies AutomataMeta
  })
}

type ArrayOpts = { minItems?: number; maxItems?: number } & ProjectFieldMeta

function arrayOf(item: z.ZodType, presentation: 'list' | 'table', opts: ArrayOpts) {
  const { minItems, maxItems, ...meta } = opts
  let schema = z.array(item)
  if (minItems !== undefined) schema = schema.min(minItems)
  if (maxItems !== undefined) schema = schema.max(maxItems)
  return schema.meta({
    ...meta,
    automata: { kind: 'array', presentation, minItems, maxItems } satisfies AutomataMeta
  })
}

/** Array rendered as a vertical list of item controls. */
export function listOf(item: z.ZodType, opts: ArrayOpts = {}) {
  return arrayOf(item, 'list', opts)
}

/** Array of objects rendered as a table (one row per item). */
export function tableOf(item: z.ZodType, opts: ArrayOpts = {}) {
  return arrayOf(item, 'table', opts)
}
