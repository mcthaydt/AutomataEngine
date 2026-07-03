# Schema Unification + Agent Prompt Layer Implementation Plan (M2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zod v4 becomes the only authored schema language for component/resource data (the `ObjectSchema` DSL is deleted), per-game JSON schemas flow into MCP tool descriptions, and a `build-game` MCP prompt expands a one-line description into the full authoring workflow.

**Architecture:** Games author zod schemas (plus typed helpers for `vec3`/`color`/`reference`/arrays). One deriver module (`packages/project/src/derive.ts`) converts zod into the existing closed `PropertySchema` IR at registration time, so the editor UI is untouched. Validation runs through `safeParse` with zod issues mapped to the existing `PropertyIssue` codes and JSON pointers. `z.toJSONSchema` output is precomputed per spec and appended to project-mode MCP tool descriptions.

**Tech Stack:** TypeScript, zod ^4.4.3, vitest 4 (workspace projects named by package, e.g. `npx vitest run --project project`), @modelcontextprotocol/sdk.

Spec: `docs/superpowers/specs/2026-07-03-schema-unification-design.md` (approved).

## Global Constraints

- zod stays pinned `^4.4.3` everywhere; zod internals (`schema.def`, `.minValue`, `_zod.bag`, `.meta()`, `.unwrap()`, `.shape`, `.options`, `.element`) are touched ONLY inside `packages/project/src/derive.ts` and `authoring.ts`.
- Coverage gate: `npm run coverage` enforces 90% lines AND branches (istanbul) across `packages/*/src`, `games/*/src`, `tools/*/src`.
- Polarity port rule (mechanical, applies to every DSL→zod port): DSL fields with `required: true` become plain zod fields; **all other fields (`required: false` or `required` absent) gain `.optional()`**. The DSL is optional-by-default; zod is required-by-default.
- Component/resource root schemas MUST be `z.strictObject(...)` (unknown keys rejected). Nested objects too.
- NEVER call `.meta()` on a helper result (`vec3()`, `color()`, `reference()`, `listOf()`, `tableOf()`) — it replaces the registered meta and loses the `automata` marker. Helpers take label/description as arguments instead. On plain zod scalars, call `.meta()` BEFORE `.optional()`.
- Verification cadence per task: workspace-scoped `npx vitest run --project <pkg>`, then `npm run lint` and `npm run typecheck` before each commit. Milestone gates at the end: `npm run ci`, `npm run coverage`, `npm run e2e`, `npm run verify:new-game`.
- Before every commit: sweep iCloud duplicates — `find . -name "* 2*" -not -path "*/node_modules/*"` must return nothing (delete any hits).
- Commit messages: conventional style (`feat(project): …`, `test(editor): …`), ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Keep this plan's checkboxes updated as tasks complete (AGENTS.md checklist upkeep rule).

## Verified zod v4 facts (from a spike against the installed zod)

These are load-bearing for Tasks 1–3; they were verified empirically, do not re-litigate them:

- `schema.def.type` is public: `'number' | 'string' | 'boolean' | 'enum' | 'object' | 'array' | 'optional' | …`
- `z.ZodNumber` exposes `.minValue` / `.maxValue` (number or `null`).
- `.meta()` (no args) returns the registered metadata object or `undefined`; metadata survives `.optional()` on the inner schema (`opt.unwrap().meta()` works).
- `z.strictObject({...}).def.catchall.def.type === 'never'`; a plain `z.object({...}).def.catchall` is `undefined`.
- `z.ZodEnum` exposes `.options` (string array); `z.ZodArray` exposes `.element`; `z.ZodObject` exposes `.shape`.
- Issue codes: missing/wrong-typed field → `invalid_type`; enum mismatch → `invalid_value`; strict-object extras → ONE `unrecognized_keys` issue at the object path with a `keys: string[]` array; number/array bounds → `too_small`/`too_big`; regex fail → `invalid_format`. `NaN` and `Infinity` both fail `z.number()` with `invalid_type`.
- `z.toJSONSchema(schema)` emits standard JSON Schema (with `additionalProperties: false` for strict objects) and inlines `.meta()` keys (so `label`, `step`, and the `automata` marker appear in the output — desirable for agents).

---

### Task 1: Authoring helpers (`@automata/project`)

**Files:**
- Create: `packages/project/src/authoring.ts`
- Create: `packages/project/tests/authoring.test.ts`
- Modify: `packages/project/src/index.ts`

**Interfaces:**
- Consumes: nothing new (zod is already a dependency of `@automata/project`).
- Produces (used by Tasks 2–8):
  - `type ProjectDataSchema = z.ZodObject<z.ZodRawShape>`
  - `interface ProjectFieldMeta { label?: string; description?: string; step?: number; multiline?: boolean }`
  - `type AutomataMeta` (discriminated on `kind: 'vec3' | 'color' | 'reference' | 'array'`)
  - `PROJECT_COLOR_RE: RegExp`
  - `vec3(meta?: ProjectFieldMeta)`, `color(meta?: ProjectFieldMeta)`,
    `reference(opts: { target: 'entity' | 'resource'; typeIds?: readonly string[] } & ProjectFieldMeta)`,
    `listOf(item: z.ZodType, opts?: { minItems?: number; maxItems?: number } & ProjectFieldMeta)`,
    `tableOf(item: z.ZodType, opts?: { minItems?: number; maxItems?: number } & ProjectFieldMeta)` — all returning zod schemas with `.meta({ ...fieldMeta, automata: {...} })` attached.

- [ ] **Step 1: Write the failing test**

`packages/project/tests/authoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { color, listOf, reference, tableOf, vec3 } from '../src'

describe('authoring helpers', () => {
  it('vec3 is a strict {x,y,z} object carrying the automata marker', () => {
    const schema = vec3({ label: 'Eye' })
    expect(schema.safeParse({ x: 0, y: 1, z: 2 }).success).toBe(true)
    expect(schema.safeParse({ x: 0, y: 1 }).success).toBe(false)
    expect(schema.safeParse({ x: 0, y: 1, z: 2, w: 3 }).success).toBe(false)
    expect(schema.meta()).toEqual({ label: 'Eye', automata: { kind: 'vec3' } })
  })

  it('color accepts #hex forms and rejects names', () => {
    const schema = color()
    for (const ok of ['#fff', '#ffff', '#a1b2c3', '#a1b2c3d4']) {
      expect(schema.safeParse(ok).success).toBe(true)
    }
    expect(schema.safeParse('red').success).toBe(false)
    expect(schema.meta()).toEqual({ automata: { kind: 'color' } })
  })

  it('reference records target and typeIds in the marker', () => {
    const schema = reference({ target: 'resource', typeIds: ['fake.target'], label: 'Target' })
    expect(schema.safeParse('some-id').success).toBe(true)
    expect(schema.safeParse(3).success).toBe(false)
    expect(schema.meta()).toEqual({
      label: 'Target',
      automata: { kind: 'reference', target: 'resource', typeIds: ['fake.target'] }
    })
  })

  it('listOf/tableOf enforce bounds through zod and record presentation', () => {
    const list = listOf(z.string(), { minItems: 1, maxItems: 2, label: 'Items' })
    expect(list.safeParse([]).success).toBe(false)
    expect(list.safeParse(['a']).success).toBe(true)
    expect(list.safeParse(['a', 'b', 'c']).success).toBe(false)
    expect(list.meta()).toEqual({
      label: 'Items',
      automata: { kind: 'array', presentation: 'list', minItems: 1, maxItems: 2 }
    })
    expect(tableOf(z.strictObject({})).meta()).toEqual({
      automata: { kind: 'array', presentation: 'table', minItems: undefined, maxItems: undefined }
    })
  })

  it('metadata survives .optional() on the inner schema', () => {
    const schema = vec3({ label: 'Eye' }).optional()
    expect(schema.unwrap().meta()).toEqual({ label: 'Eye', automata: { kind: 'vec3' } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project project tests/authoring.test.ts`
Expected: FAIL — `'../src'` has no export named `vec3`.

- [ ] **Step 3: Write the implementation**

`packages/project/src/authoring.ts`:

```ts
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
```

Add to `packages/project/src/index.ts` (after the `./schema` export):

```ts
export * from './authoring'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project project tests/authoring.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add packages/project/src/authoring.ts packages/project/src/index.ts packages/project/tests/authoring.test.ts
git commit -m "feat(project): zod authoring helpers for editor schema kinds"
```

---

### Task 2: IR derivation (`derive.ts`)

**Files:**
- Create: `packages/project/src/derive.ts`
- Create: `packages/project/tests/derive.test.ts`
- Modify: `packages/project/src/index.ts`

**Interfaces:**
- Consumes: Task 1 (`ProjectDataSchema`, `AutomataMeta`, `ProjectFieldMeta`); existing `ObjectSchema`/`PropertySchema` types and `escapePointerToken` from `./pointer`.
- Produces (used by Tasks 3–4):
  - `class SchemaDeriveError extends Error { readonly path: string }`
  - `deriveObjectSchema(dataSchema: ProjectDataSchema): ObjectSchema`

- [ ] **Step 1: Write the failing test**

`packages/project/tests/derive.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { color, deriveObjectSchema, listOf, reference, tableOf, vec3, SchemaDeriveError } from '../src'

describe('deriveObjectSchema', () => {
  it('derives every supported construct into the closed IR', () => {
    const schema = z.strictObject({
      speed: z.number().min(0).max(20).meta({ label: 'Speed', step: 0.5 }),
      mode: z.enum(['chase', 'kite']).meta({ label: 'Mode' }),
      note: z.string().meta({ label: 'Note', multiline: true }).optional(),
      alive: z.boolean(),
      tint: color({ label: 'Tint' }),
      position: vec3({ label: 'Position' }),
      target: reference({ target: 'resource', typeIds: ['fake.target'], label: 'Target' }).optional(),
      rows: tableOf(
        z.strictObject({ id: z.string().meta({ label: 'ID' }) }),
        { label: 'Rows', minItems: 1 }
      ).optional(),
      nested: z.strictObject({ half: z.number().min(1) }).meta({ label: 'Nested' })
    })

    expect(deriveObjectSchema(schema)).toEqual({
      kind: 'object',
      fields: [
        { kind: 'number', key: 'speed', label: 'Speed', required: true, min: 0, max: 20, step: 0.5 },
        { kind: 'enum', key: 'mode', label: 'Mode', required: true, values: ['chase', 'kite'] },
        { kind: 'string', key: 'note', label: 'Note', required: false, multiline: true },
        { kind: 'boolean', key: 'alive', required: true },
        { kind: 'color', key: 'tint', label: 'Tint', required: true },
        { kind: 'vec3', key: 'position', label: 'Position', required: true },
        {
          kind: 'reference', key: 'target', label: 'Target', required: false,
          target: 'resource', typeIds: ['fake.target']
        },
        {
          kind: 'array', key: 'rows', label: 'Rows', required: false,
          presentation: 'table', minItems: 1,
          item: { kind: 'object', fields: [{ kind: 'string', key: 'id', label: 'ID', required: true }] }
        },
        {
          kind: 'object', key: 'nested', label: 'Nested', required: true,
          fields: [{ kind: 'number', key: 'half', required: true, min: 1 }]
        }
      ]
    })
  })

  it('rejects non-strict objects with the offending path', () => {
    const loose = z.strictObject({ inner: z.object({ a: z.string() }) })
    expect(() => deriveObjectSchema(loose)).toThrow(SchemaDeriveError)
    expect(() => deriveObjectSchema(loose)).toThrow(/strictObject/)
    expect(() => deriveObjectSchema(loose)).toThrow(/\/inner/)
  })

  it('rejects bare z.array (arrays must come from listOf/tableOf)', () => {
    expect(() => deriveObjectSchema(z.strictObject({ xs: z.array(z.string()) })))
      .toThrow(/listOf|tableOf/)
  })

  it('rejects unsupported zod constructs with the offending path', () => {
    expect(() => deriveObjectSchema(z.strictObject({ u: z.union([z.string(), z.number()]) })))
      .toThrow(/unsupported zod construct/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project project tests/derive.test.ts`
Expected: FAIL — no export named `deriveObjectSchema`.

- [ ] **Step 3: Write the implementation**

`packages/project/src/derive.ts` (the ONLY module allowed to introspect zod):

```ts
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

function unwrapOptional(schema: z.ZodType): { inner: z.ZodType; required: boolean } {
  let inner = schema
  let required = true
  while (inner.def.type === 'optional') {
    required = false
    inner = (inner as z.ZodOptional<z.ZodType>).unwrap()
  }
  return { inner, required }
}

/** Derive the object-root IR for one component/resource data schema. */
export function deriveObjectSchema(dataSchema: ProjectDataSchema): ObjectSchema {
  const root = deriveNode(dataSchema, '')
  if (root.kind !== 'object') {
    throw new SchemaDeriveError('component/resource schemas must be zod objects', '')
  }
  return root
}

function deriveNode(schema: z.ZodType, path: string): PropertySchema {
  const meta = metaOf(schema)
  const common = {
    ...(meta.label !== undefined ? { label: meta.label } : {}),
    ...(meta.description !== undefined ? { description: meta.description } : {})
  }
  const marker = meta.automata

  switch (schema.def.type) {
    case 'number': {
      const number = schema as z.ZodNumber
      return {
        kind: 'number',
        ...common,
        ...(number.minValue !== null ? { min: number.minValue } : {}),
        ...(number.maxValue !== null ? { max: number.maxValue } : {}),
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
        const { inner, required } = unwrapOptional(field as z.ZodType)
        const node = deriveNode(inner, `${path}/${escapePointerToken(key)}`)
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
```

Add to `packages/project/src/index.ts`:

```ts
export * from './derive'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project project tests/derive.test.ts`
Expected: PASS. (If `.def.catchall` typing fights the compiler, the casts shown above are the sanctioned escape hatch — they are already the loosest allowed.)

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add packages/project/src/derive.ts packages/project/src/index.ts packages/project/tests/derive.test.ts
git commit -m "feat(project): derive the closed editor IR from zod schemas"
```

---

### Task 3: Zod validation with pointer/code parity

**Files:**
- Modify: `packages/project/src/derive.ts`
- Create: `packages/project/tests/validateData.test.ts`

**Interfaces:**
- Consumes: Task 2 IR shapes; `PropertyIssue` from `./schema`.
- Produces (used by Task 4): `validateDataSchema(dataSchema: ProjectDataSchema, ir: ObjectSchema, value: unknown): PropertyIssue[]` — same codes, messages, and RFC 6901 pointers as the DSL `validateProperty`.

- [ ] **Step 1: Write the failing parity test**

`packages/project/tests/validateData.test.ts` — these cases are ports of `tests/schema.test.ts`, re-authored in zod. The expected codes/pointers are copied from the DSL tests verbatim:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { color, deriveObjectSchema, reference, tableOf, validateDataSchema, vec3 } from '../src'
import type { ProjectDataSchema } from '../src'

const stats = z.strictObject({
  speed: z.number().min(0).max(20).meta({ label: 'Speed', step: 0.5 }),
  mode: z.enum(['chase', 'kite']).meta({ label: 'Mode' }),
  tint: color({ label: 'Tint' }),
  target: reference({ target: 'resource', typeIds: ['fake.target'], label: 'Target' }).optional()
})

function validate(schema: ProjectDataSchema, value: unknown) {
  return validateDataSchema(schema, deriveObjectSchema(schema), value)
}

describe('validateDataSchema parity with the DSL validator', () => {
  it('validates nested values and reports JSON Pointer locations', () => {
    expect(validate(stats, { speed: -1, mode: 'other', tint: '#fff' })).toEqual([
      expect.objectContaining({ pointer: '/speed', code: 'number.min' }),
      expect.objectContaining({ pointer: '/mode', code: 'enum.value' })
    ])
  })

  it('accepts a fully valid object', () => {
    expect(validate(stats, { speed: 4, mode: 'chase', tint: '#0a0a0a', target: 'fake.a' })).toEqual([])
  })

  it('reports missing required fields and unknown keys', () => {
    expect(validate(stats, { tint: '#fff', extra: 1 })).toEqual([
      expect.objectContaining({ pointer: '/speed', code: 'required' }),
      expect.objectContaining({ pointer: '/mode', code: 'required' }),
      expect.objectContaining({ pointer: '/extra', code: 'object.unknownKey' })
    ])
  })

  it('escapes JSON Pointer tokens for awkward keys', () => {
    const schema = z.strictObject({ 'a/b~c': z.number().meta({ label: 'X' }) })
    expect(validate(schema, { 'a/b~c': 'no' })).toEqual([
      expect.objectContaining({ pointer: '/a~1b~0c', code: 'number.type' })
    ])
  })

  it('maps scalar type failures to the DSL codes', () => {
    const scalars = z.strictObject({
      flag: z.boolean(),
      name: z.string(),
      tint: color(),
      position: vec3(),
      capped: z.number().max(3)
    })
    expect(validate(scalars, { flag: 'yes', name: 5, tint: 'red', position: { x: 0, y: 0 }, capped: 9 })).toEqual([
      expect.objectContaining({ pointer: '/flag', code: 'boolean.type' }),
      expect.objectContaining({ pointer: '/name', code: 'string.type' }),
      expect.objectContaining({ pointer: '/tint', code: 'color.format' }),
      expect.objectContaining({ pointer: '/position', code: 'vec3.type' }),
      expect.objectContaining({ pointer: '/capped', code: 'number.max' })
    ])
    expect(validate(scalars, { flag: true, name: 'ok', tint: '#0a0a0a', position: { x: 0, y: 1, z: 2 }, capped: 2 })).toEqual([])
  })

  it('collapses issues inside a vec3 to one vec3.type at the vec3 pointer', () => {
    const schema = z.strictObject({ eye: vec3() })
    expect(validate(schema, { eye: { x: 0, y: Infinity, z: 2 } })).toEqual([
      expect.objectContaining({ pointer: '/eye', code: 'vec3.type' })
    ])
    expect(validate(schema, { eye: { x: 0, y: 0 } })).toEqual([
      expect.objectContaining({ pointer: '/eye', code: 'vec3.type' })
    ])
  })

  it('rejects NaN and non-finite numbers as number.type', () => {
    const schema = z.strictObject({ n: z.number() })
    expect(validate(schema, { n: Number.NaN })[0]).toMatchObject({ code: 'number.type', pointer: '/n' })
    expect(validate(schema, { n: Infinity })[0]).toMatchObject({ code: 'number.type', pointer: '/n' })
  })

  it('flags empty required references and allows empty optional ones', () => {
    const requiredRef = z.strictObject({ r: reference({ target: 'entity' }) })
    expect(validate(requiredRef, { r: '' })[0]).toMatchObject({ code: 'reference.empty', pointer: '/r' })
    expect(validate(requiredRef, { r: 'some-id' })).toEqual([])
    expect(validate(requiredRef, { r: 3 })[0]).toMatchObject({ code: 'reference.type', pointer: '/r' })
    const optionalRef = z.strictObject({ r: reference({ target: 'entity' }).optional() })
    expect(validate(optionalRef, { r: '' })).toEqual([])
  })

  it('rejects non-objects at the root', () => {
    expect(validate(stats, null)[0]).toMatchObject({ code: 'object.type', pointer: '' })
  })

  it('enforces array bounds and recurses element pointers', () => {
    const table = z.strictObject({
      rows: tableOf(stats, { minItems: 1, maxItems: 1 })
    })
    expect(validate(table, { rows: [] })[0]).toMatchObject({ code: 'array.minItems', pointer: '/rows' })
    expect(validate(table, {
      rows: [
        { speed: 4, mode: 'chase', tint: '#fff' },
        { speed: 1, mode: 'kite', tint: '#fff' }
      ]
    })[0]).toMatchObject({ code: 'array.maxItems', pointer: '/rows' })
    expect(validate(table, { rows: [{ speed: -1, mode: 'chase', tint: '#fff' }] })[0])
      .toMatchObject({ pointer: '/rows/0/speed', code: 'number.min' })
    expect(validate(table, { rows: 'not-array' })[0]).toMatchObject({ code: 'array.type', pointer: '/rows' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project project tests/validateData.test.ts`
Expected: FAIL — no export named `validateDataSchema`.

- [ ] **Step 3: Implement the mapper in `derive.ts`**

Append to `packages/project/src/derive.ts`:

```ts
import type { PropertyIssue } from './schema'   // merge into the existing type import

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
        const parent = valueAt(root, issue.path.slice(0, -1))
        const key = issue.path[issue.path.length - 1]
        const missing =
          issue.path.length > 0 &&
          parent !== null && typeof parent === 'object' && !Array.isArray(parent) &&
          (!(String(key) in (parent as Record<string, unknown>)) ||
            (parent as Record<string, unknown>)[String(key)] === undefined)
        if (missing) {
          push({ code: 'required', message: `${node?.label ?? String(key)} is required`, pointer })
          break
        }
        const mapped = node ? TYPE_CODES[node.kind] : TYPE_CODES.object
        push({ code: mapped.code, message: mapped.message, pointer })
        break
      }
      case 'invalid_value':
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
```

Note: zod reports missing-vs-wrong-type identically (`invalid_type`), so the mapper inspects the input value to emit `required` exactly where the DSL did. The vec3 collapse handles issues zod raises *inside* the `{x,y,z}` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project project tests/validateData.test.ts`
Expected: PASS (10 tests). Also run the full package to confirm nothing regressed: `npx vitest run --project project`.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add packages/project/src/derive.ts packages/project/tests/validateData.test.ts
git commit -m "feat(project): zod validation with DSL-parity issue codes and pointers"
```

---

### Task 4: Registration adapter (accept DSL or zod)

**Files:**
- Modify: `packages/project/src/registration.ts`
- Modify: `packages/project/src/validation.ts`
- Modify: `packages/project/src/edit.ts`
- Modify: `packages/editor/src/project/registration.ts`
- Modify: `packages/project/tests/registration.test.ts` (add cases; existing DSL cases stay green)

**Interfaces:**
- Consumes: Tasks 1–3 (`ProjectDataSchema`, `deriveObjectSchema`, `validateDataSchema`).
- Produces (used by Tasks 5–11):
  - `ComponentTypeRegistration` / `ResourceTypeRegistration` gain `dataSchema?: ProjectDataSchema` and `jsonSchema?: Record<string, unknown>`; `schema: ObjectSchema` remains the derived IR every existing consumer reads.
  - `type ComponentTypeInput = Omit<ComponentTypeRegistration, 'schema' | 'dataSchema' | 'jsonSchema'> & { schema: ObjectSchema | ProjectDataSchema }` (and `ResourceTypeInput` likewise).
  - `type GameProjectDefinitionInput<Compiled>` — same as `GameProjectDefinition` but with input spec arrays; `defineGameProject(input: GameProjectDefinitionInput<C>): GameProjectDefinition<C>`.
  - `normalizeComponentType(input: ComponentTypeInput): ComponentTypeRegistration`, `normalizeResourceType(...)`.
  - `validateSpecData(spec: { schema: ObjectSchema; dataSchema?: ProjectDataSchema }, value: unknown): PropertyIssue[]` — zod path when `dataSchema` exists, DSL walker otherwise.

- [ ] **Step 1: Write the failing test**

Append to `packages/project/tests/registration.test.ts`:

```ts
import { z } from 'zod'
import { color } from '../src'

describe('defineGameProject with zod schemas', () => {
  const zodStats = z.strictObject({
    speed: z.number().min(0).max(20).meta({ label: 'Speed', step: 0.5 }),
    mode: z.enum(['chase', 'kite']).meta({ label: 'Mode' }),
    tint: color({ label: 'Tint' })
  })

  it('derives the IR, keeps the zod source, and emits a JSON schema', () => {
    const def = defineGameProject({
      gameId: 'fake', label: 'Fake', createTemplate: makeTemplate,
      components: [{
        typeId: 'fake.stats', label: 'Stats', schema: zodStats,
        defaultData: { speed: 1, mode: 'chase', tint: '#fff' }, cardinality: { min: 0, max: 1 }
      }],
      resources: [], validate: () => [], compile: () => ({})
    })
    const spec = def.components[0]!
    expect(spec.schema).toMatchObject({
      kind: 'object',
      fields: [
        expect.objectContaining({ kind: 'number', key: 'speed', min: 0, max: 20, step: 0.5 }),
        expect.objectContaining({ kind: 'enum', key: 'mode', values: ['chase', 'kite'] }),
        expect.objectContaining({ kind: 'color', key: 'tint' })
      ]
    })
    expect(spec.dataSchema).toBe(zodStats)
    expect(spec.jsonSchema).toMatchObject({ type: 'object', additionalProperties: false })
  })

  it('rejects zod-authored defaults that fail their own schema', () => {
    expect(() => defineGameProject({
      gameId: 'fake', label: 'Fake', createTemplate: makeTemplate,
      components: [{
        typeId: 'fake.stats', label: 'Stats', schema: zodStats,
        defaultData: { speed: -1, mode: 'chase', tint: '#fff' }, cardinality: { min: 0, max: 1 }
      }],
      resources: [], validate: () => [], compile: () => ({})
    })).toThrow(/number\.min/)
  })

  it('accepts mixed DSL and zod specs during the migration window', () => {
    const def = defineGameProject({
      gameId: 'fake', label: 'Fake', createTemplate: makeTemplate,
      components: [goodComponent, {
        typeId: 'fake.zod', label: 'Zod', schema: zodStats,
        defaultData: { speed: 1, mode: 'kite', tint: '#000' }, cardinality: { min: 0, max: 1 }
      }],
      resources: [], validate: () => [], compile: () => ({})
    })
    expect(def.components.map((component) => component.dataSchema !== undefined)).toEqual([false, true])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project project tests/registration.test.ts`
Expected: FAIL — zod schema not assignable / `dataSchema` undefined behavior missing.

- [ ] **Step 3: Implement the adapter**

In `packages/project/src/registration.ts`:

1. Replace the imports at the top:

```ts
import { z } from 'zod'
import { validateProperty } from './schema'
import type { ObjectSchema, PropertyIssue } from './schema'
import type { ProjectDataSchema } from './authoring'
import { deriveObjectSchema, validateDataSchema } from './derive'
import type { ProjectSnapshot } from './model'
```

2. Extend both spec interfaces (`ComponentTypeRegistration` after `schema: ObjectSchema`, `ResourceTypeRegistration` likewise):

```ts
  /** Derived editor IR. Populated by normalization; consumers read this. */
  schema: ObjectSchema
  /** Authored zod schema — the validation source of truth when present. */
  dataSchema?: ProjectDataSchema
  /** `z.toJSONSchema(dataSchema)`, precomputed for MCP tool descriptions. */
  jsonSchema?: Record<string, unknown>
```

3. Add the input types and normalizers (below the interfaces):

```ts
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
```

4. Change `defineGameProject` to normalize first and validate the normalized definition; its signature becomes:

```ts
export function defineGameProject<Compiled>(input: GameProjectDefinitionInput<Compiled>): GameProjectDefinition<Compiled> {
  if (!input.gameId) throw new Error('defineGameProject: gameId must be non-empty')

  const definition: GameProjectDefinition<Compiled> = {
    ...input,
    components: input.components.map(normalizeComponentType),
    resources: input.resources.map(normalizeResourceType)
  }
  // ...existing assertion body unchanged, operating on `definition`...
  return definition
}
```

5. `assertValidDefault` now takes the spec and dispatches:

```ts
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
```

Call sites become `assertValidDefault('component', component.typeId, component, component.defaultData)` (same for resources).

6. Switch the remaining `validateProperty(registration.schema, …)` call sites to `validateSpecData(registration, …)`:
   - `packages/project/src/validation.ts` — two sites in `validateRegistration` (lines ~104 and ~125): `for (const issue of validateSpecData(registration, component.data))` / `validateSpecData(registration, resource.data)`. Update the import: `import { validateSpecData } from './registration'` replaces the `validateProperty` import from `./schema` (keep the `ObjectSchema`/`PropertySchema`/`ReferenceProperty` type imports).
   - `packages/project/src/edit.ts` — `assertSchemaData` now receives the spec object:

```ts
function assertSchemaData(
  spec: ComponentTypeRegistration | ResourceTypeRegistration | undefined,
  data: unknown, label: string, typeId: string, target: ProjectTarget
): void {
  if (!spec) return
  const issues = validateSpecData(spec, data)
  if (issues.length > 0) throw new ProjectCommandError(`Invalid ${label} data for "${typeId}": ${formatIssues(issues)}`, `${label}.invalid`, target)
}
```

     Its two callers in `resolveTarget` pass `registration` instead of `registration?.schema`. `assertComponentData`, `assertResourceData`, and `assertEntityComponents` replace `validateProperty(registration.schema, …)` with `validateSpecData(registration, …)`. Update imports (`validateSpecData`, `ComponentTypeRegistration`, `ResourceTypeRegistration` from `./registration`; drop `validateProperty` and the now-unused `ObjectSchema` type import).
   - `packages/editor/src/project/registration.ts` — the prefab check (line ~83) becomes `const issues = validateSpecData(componentType, component.data)`; import `validateSpecData` from `@automata/project` (replacing `validateProperty` in that import list).

- [ ] **Step 4: Run tests to verify everything passes**

Run: `npx vitest run --project project && npx vitest run --project editor`
Expected: PASS — all existing DSL-based tests plus the three new zod cases.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add packages/project/src packages/project/tests/registration.test.ts packages/editor/src/project/registration.ts
git commit -m "feat(project): registration accepts zod schemas alongside the DSL"
```

---

### Task 5: Migrate core components to zod

**Files:**
- Modify: `packages/project/src/core.ts`

**Interfaces:**
- Consumes: Task 1 helpers, Task 4 `normalizeComponentType`.
- Produces: `CORE_COMPONENTS` entries all carry `dataSchema`/`jsonSchema`; IR/labels/bounds identical to today (existing validation/edit/editor tests prove it).

- [ ] **Step 1: Rewrite the six core component schemas**

Replace the DSL literals in `packages/project/src/core.ts`. New imports:

```ts
import { z } from 'zod'
import { color, reference, vec3 } from './authoring'
import { normalizeComponentType } from './registration'
import type { ComponentTypeRegistration, GameProjectDefinition, ResourceTypeRegistration } from './registration'
```

Each spec wraps in `normalizeComponentType` (core specs never pass through `defineGameProject`). The six schemas — everything else (typeIds, defaults, cardinality, gizmos, comments) stays exactly as-is:

```ts
const transform: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.transform,
  label: 'Transform',
  schema: z.strictObject({
    position: vec3({ label: 'Position' }),
    rotation: vec3({ label: 'Rotation (rad)' }),
    scale: vec3({ label: 'Scale' })
  }),
  defaultData: { position: { ...ORIGIN }, rotation: { ...ORIGIN }, scale: { ...UNIT } },
  cardinality: { min: 0, max: 1 }
})

const primitive: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.primitive,
  label: 'Primitive',
  schema: z.strictObject({
    shape: z.enum(['box', 'cylinder', 'sphere', 'plane']).meta({ label: 'Shape' }),
    size: vec3({ label: 'Size' })
  }),
  defaultData: { shape: 'box', size: { ...UNIT } },
  cardinality: { min: 0, max: 1 }
})

const surface: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.surface,
  label: 'Surface',
  schema: z.strictObject({
    color: color({ label: 'Color' }),
    texture: reference({ target: 'resource', label: 'Texture' }).optional()
  }),
  defaultData: { color: '#808080' },
  cardinality: { min: 0, max: 1 }
})

const collider: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.collider,
  label: 'Collider',
  schema: z.strictObject({
    shape: z.enum(['none', 'box', 'cylinder', 'sphere']).meta({ label: 'Shape' }),
    friction: z.number().min(0).meta({ label: 'Friction' }).optional()
  }),
  defaultData: { shape: 'box', friction: 1 },
  cardinality: { min: 0, max: 1 }
})

const zone: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.zone,
  label: 'Zone',
  schema: z.strictObject({
    shape: z.enum(['box', 'circle']).meta({ label: 'Shape' }),
    // box uses (x,y,z) full dimensions; circle uses x as radius.
    size: vec3({ label: 'Size' }),
    color: color({ label: 'Editor Color' })
  }),
  defaultData: { shape: 'box', size: { ...UNIT }, color: '#39ff14' },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'zone' }
})

const camera: ComponentTypeRegistration = normalizeComponentType({
  typeId: CORE_TYPE_IDS.camera,
  label: 'Camera',
  schema: z.strictObject({
    fov: z.number().min(1).max(179).meta({ label: 'Field of View' }),
    eye: vec3({ label: 'Eye' }),
    target: vec3({ label: 'Target' })
  }),
  defaultData: { fov: 60, eye: { x: 0, y: 5, z: 10 }, target: { ...ORIGIN } },
  cardinality: { min: 0, max: 1 }
})
```

- [ ] **Step 2: Run the affected suites**

Run: `npx vitest run --project project && npx vitest run --project editor`
Expected: PASS — core behavior is pinned by the existing validation/edit/editor tests.

- [ ] **Step 3: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add packages/project/src/core.ts
git commit -m "feat(project): author core components in zod"
```

---

### Task 6: Migrate pulsebreak to zod

**Files:**
- Modify: `games/pulsebreak/src/project/definition.ts`
- Modify: `games/pulsebreak/package.json` (add `"zod": "^4.4.3"` to `dependencies`)

**Interfaces:**
- Consumes: Task 1 helpers, Task 4 input types.
- Produces: pulsebreak's definition authored in zod; exported symbol `pulsebreakProjectDefinition` unchanged.

- [ ] **Step 1: Rewrite the schema literals**

In `games/pulsebreak/src/project/definition.ts`, replace the import block and the five spec constants (the `validatePulsebreakProject` half of the file is untouched):

```ts
import { z } from 'zod'
import {
  color, defineGameProject, listOf, tableOf, vec3,
  type ComponentTypeInput, type GameProjectDefinition,
  type ProjectSnapshot, type ResourceTypeInput, type ValidationIssue
} from '@automata/project'
import { compilePulsebreakProject } from './compiler'
import { createPulsebreakTemplate } from './template'
import { PULSEBREAK_TYPE_IDS, type PulsebreakCompiledProject } from './types'
import { ENEMY_KINDS } from '../entity'

const num = (label: string) => z.number().min(0).meta({ label })
const optionalNum = (label: string) => z.number().min(0).meta({ label }).optional()

const playerStart: ComponentTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.playerStart, label: 'Player Start',
  schema: z.strictObject({}),
  defaultData: {}, cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#27e0ff' }
}

const spawnZone: ComponentTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.spawnZone, label: 'Spawn Zone',
  schema: z.strictObject({
    mode: z.enum(['ring', 'point']).meta({ label: 'Mode' }),
    radius: num('Radius'),
    weight: num('Weight'),
    enemies: listOf(z.string(), { label: 'Enemy Types' }).optional(),
    minSeparation: num('Min Separation'),
    edgePaddingMin: num('Edge Padding Min'),
    edgePaddingMax: num('Edge Padding Max'),
    angleJitterRad: num('Angle Jitter (rad)')
  }),
  defaultData: { mode: 'ring', radius: 13, weight: 1, enemies: [], minSeparation: 0, edgePaddingMin: 1, edgePaddingMax: 3, angleJitterRad: 0.35 },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'zone', color: '#ff2e88' }
}

const tuning: ResourceTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.tuning, label: 'Tuning', singleton: true,
  schema: z.strictObject({
    arena: z.strictObject({
      half: num('Half'),
      y: z.number().meta({ label: 'Y' })
    }).meta({ label: 'Arena' }),
    camera: z.strictObject({
      eye: vec3({ label: 'Eye' }),
      look: vec3({ label: 'Look' })
    }).meta({ label: 'Camera' }),
    player: z.strictObject({
      radius: num('Radius'), startHealth: num('Start Health'), baseDamage: num('Base Damage'),
      baseFireRate: num('Base Fire Rate'), baseMoveSpeed: num('Base Move Speed'), projectileSpeed: num('Projectile Speed'),
      projectileRadius: num('Projectile Radius'), range: num('Range'), invulnS: num('Invuln (s)'),
      color: color({ label: 'Color' })
    }).meta({ label: 'Player' }),
    projectileLifetimeS: num('Projectile Lifetime (s)')
  }),
  defaultData: createPulsebreakTemplate().resources.tuning!.data as Record<string, unknown>
}

const enemyTypes: ResourceTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.enemyTypes, label: 'Enemy Types', singleton: true,
  schema: z.strictObject({
    enemies: tableOf(z.strictObject({
      id: z.string().meta({ label: 'ID' }),
      health: num('Health'), radius: num('Radius'), speed: num('Speed'),
      contactDamage: num('Contact Damage'), scoreValue: num('Score'),
      color: color({ label: 'Color' }),
      cooldownS: optionalNum('Cooldown (s)'), projectileSpeed: optionalNum('Projectile Speed'),
      projectileDamage: optionalNum('Projectile Damage'), projectileRadius: optionalNum('Projectile Radius'),
      range: optionalNum('Range'), preferredRange: optionalNum('Preferred Range'), burst: optionalNum('Burst')
    }), { label: 'Enemies' }).optional()
  }),
  defaultData: { enemies: [] }
}

const waveSet: ResourceTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.waveSet, label: 'Wave Set', singleton: true,
  schema: z.strictObject({
    waves: listOf(z.strictObject({
      id: z.string().meta({ label: 'ID' }),
      spawns: tableOf(z.strictObject({
        enemyTypeId: z.string().meta({ label: 'Enemy' }),
        count: num('Count')
      }), { label: 'Spawns' }).optional()
    }), { label: 'Waves' }).optional()
  }),
  defaultData: { waves: [] }
}

const upgradeSet: ResourceTypeInput = {
  typeId: PULSEBREAK_TYPE_IDS.upgradeSet, label: 'Upgrade Set', singleton: true,
  schema: z.strictObject({
    upgrades: tableOf(z.strictObject({
      id: z.enum(['damage', 'fireRate', 'moveSpeed', 'maxHealth']).meta({ label: 'ID' }),
      label: z.string().meta({ label: 'Label' }),
      description: z.string().meta({ label: 'Description' }),
      step: num('Step')
    }), { label: 'Upgrades' }).optional()
  }),
  defaultData: { upgrades: [] }
}
```

Every field that lacked `required: true` in the DSL carries `.optional()` above (`enemies`, `waves`, `spawns`, `upgrades`) — that is the polarity port rule, not a judgment call.

- [ ] **Step 2: Add the zod dependency**

In `games/pulsebreak/package.json` `dependencies`, add `"zod": "^4.4.3"`.

- [ ] **Step 3: Run the affected suites**

Run: `npx vitest run --project pulsebreak && npx vitest run --project project`
Expected: PASS — pulsebreak's content round-trip and definition tests pin the behavior.

- [ ] **Step 4: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add games/pulsebreak/src/project/definition.ts games/pulsebreak/package.json package-lock.json
git commit -m "feat(pulsebreak): author project schemas in zod"
```

---

### Task 7: Migrate the scaffold template to zod

**Files:**
- Modify: `tools/scaffold/src/templates/projectFiles.ts` (the `definitionTs` function only)
- Modify: `tools/scaffold/src/templates/configFiles.ts` (generated `package.json` gains `"zod": "^4.4.3"`)

**Interfaces:**
- Consumes: Task 1 helpers, Task 4 input types (inside the generated code).
- Produces: `npm run new-game <name>` emits a zod-native `definition.ts`.

- [ ] **Step 1: Replace `definitionTs`**

In `tools/scaffold/src/templates/projectFiles.ts`, replace the body of `definitionTs(name, label)` with (note: everything below is inside the template literal the function returns; `${name}`/`${label}` are template substitutions, and inner backticks stay escaped exactly as in the current file):

```ts
export function definitionTs(name: string, label: string): string {
  return `import { z } from 'zod'
import {
  color, defineGameProject,
  type ComponentTypeInput, type GameProjectDefinition,
  type ProjectSnapshot, type ResourceTypeInput, type ValidationIssue
} from '@automata/project'
import { compileProject } from './compiler'
import { createTemplate } from './template'
import { GAME_TYPE_IDS, type CompiledProject } from './types'

const num = (label: string, min = 0) => z.number().min(min).meta({ label })

const spawnPoint: ComponentTypeInput = {
  typeId: GAME_TYPE_IDS.spawnPoint,
  label: 'Spawn Point',
  schema: z.strictObject({}),
  defaultData: {},
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#27e0ff' }
}

const tuning: ResourceTypeInput = {
  typeId: GAME_TYPE_IDS.tuning,
  label: 'Tuning',
  singleton: true,
  schema: z.strictObject({
    arenaHalf: num('Arena Half-Extent', 1),
    moveSpeed: num('Move Speed'),
    goal: z.strictObject({
      x: z.number().meta({ label: 'X' }),
      z: z.number().meta({ label: 'Z' })
    }).meta({ label: 'Goal' }),
    goalRadius: num('Goal Radius'),
    timeLimitS: num('Time Limit (s)'),
    colors: z.strictObject({
      floor: color({ label: 'Floor' }),
      player: color({ label: 'Player' }),
      goal: color({ label: 'Goal' })
    }).meta({ label: 'Colors' })
  }),
  defaultData: createTemplate().resources.tuning!.data as Record<string, unknown>
}
`
  // …the existing docblock, defineGameProject call, and validateSnapshot
  // sections of the template string continue UNCHANGED from here.
}
```

Concretely: only the import block, the `numberField` helper (now `num`), and the two spec constants change inside the template string; the `/** … */` docblock, `export const projectDefinition = defineGameProject<CompiledProject>({ … })`, and `validateSnapshot` stay byte-identical.

- [ ] **Step 2: Add zod to the generated package.json**

In `tools/scaffold/src/templates/configFiles.ts`, the generated `dependencies` block becomes:

```ts
    dependencies: {
      '@automata/editor': '*',
      '@automata/engine': '*',
      '@automata/project': '*',
      zod: '^4.4.3'
    },
```

- [ ] **Step 3: Run the scaffold suite**

Run: `npx vitest run --project scaffold`
Expected: PASS. If a template snapshot/content test asserts the old `definition.ts` text, update the expectation to the new zod template — that test exists to catch template drift, and this is intentional drift.

- [ ] **Step 4: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add tools/scaffold/src/templates
git commit -m "feat(scaffold): generate zod-native project definitions"
```

(The full `verify:new-game` clean-clone proof runs once at the final gate — it takes minutes.)

---

### Task 8: Migrate monkey-ball to zod

**Files:**
- Modify: `games/monkey-ball/src/project/definition.ts`
- Modify: `games/monkey-ball/package.json` (add `"zod": "^4.4.3"` to `dependencies`)

**Interfaces:**
- Consumes: Task 1 helpers, Task 4 input types.
- Produces: monkey-ball's definition authored in zod; `monkeyBallProjectDefinition` unchanged.

- [ ] **Step 1: Rewrite the schema literals**

Replace the import block and the five spec constants in `games/monkey-ball/src/project/definition.ts` (the `validateMonkeyBallProject` half stays untouched):

```ts
import { z } from 'zod'
import {
  defineGameProject, listOf, vec3,
  type ComponentTypeInput,
  type GameProjectDefinition,
  type ProjectSnapshot,
  type ResourceTypeInput,
  type ValidationIssue
} from '@automata/project'
import { compileMonkeyBallProject } from './compiler'
import { createMonkeyBallTemplate } from './template'
import { MONKEY_BALL_TYPE_IDS, type CompiledMonkeyBallProject } from './types'

const spawn: ComponentTypeInput = {
  typeId: MONKEY_BALL_TYPE_IDS.spawn,
  label: 'Spawn',
  schema: z.strictObject({
    timeLimitS: z.number().min(1).meta({ label: 'Time Limit (s)' }),
    fallY: z.number().meta({ label: 'Fall Height' })
  }),
  defaultData: { timeLimitS: 60, fallY: -10 },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#ff5964' }
}

const goal: ComponentTypeInput = {
  typeId: MONKEY_BALL_TYPE_IDS.goal,
  label: 'Goal',
  schema: z.strictObject({}),
  defaultData: {},
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#4ecdc4' }
}

const archetype: ComponentTypeInput = {
  typeId: MONKEY_BALL_TYPE_IDS.archetype,
  label: 'Archetype',
  schema: z.strictObject({
    archetypeId: z.enum(['banana', 'bumper', 'moving-platform']).meta({ label: 'Archetype' }),
    overrides: z.strictObject({
      movingPlatform: z.strictObject({
        waypoints: listOf(vec3(), { label: 'Waypoints' }),
        speed: z.number().min(0).meta({ label: 'Speed' }),
        mode: z.enum(['loop', 'pingpong']).meta({ label: 'Mode' })
      }).meta({ label: 'Moving Platform' }).optional(),
      renderable: z.strictObject({
        radius: z.number().min(0).meta({ label: 'Radius' }).optional(),
        height: z.number().min(0).meta({ label: 'Height' }).optional()
      }).meta({ label: 'Renderable' }).optional(),
      rigidBody: z.strictObject({
        shape: z.strictObject({
          type: z.enum(['cylinder']).meta({ label: 'Type' }),
          halfHeight: z.number().min(0).meta({ label: 'Half Height' }),
          radius: z.number().min(0).meta({ label: 'Radius' })
        }).meta({ label: 'Shape' })
      }).meta({ label: 'Rigid Body' }).optional()
    }).meta({ label: 'Overrides' })
  }),
  defaultData: { archetypeId: 'banana', overrides: {} },
  cardinality: { min: 0, max: 1 },
  gizmo: { kind: 'point', color: '#ffd23f' }
}

const physics: ResourceTypeInput = {
  typeId: MONKEY_BALL_TYPE_IDS.physics,
  label: 'Physics',
  singleton: true,
  schema: z.strictObject({
    maxTiltRad: z.number().min(0).max(Math.PI / 4).meta({ label: 'Max Tilt (rad)' }),
    tiltSmooth: z.number().min(0).max(1).meta({ label: 'Tilt Smoothing' }),
    gravity: z.number().min(0).meta({ label: 'Gravity' }),
    ball: z.strictObject({
      radius: z.number().min(0).meta({ label: 'Radius' }),
      friction: z.number().min(0).meta({ label: 'Friction' })
    }).meta({ label: 'Ball' })
  }),
  defaultData: createMonkeyBallTemplate().resources.physics!.data as Record<string, unknown>
}

const worlds: ResourceTypeInput = {
  typeId: MONKEY_BALL_TYPE_IDS.worlds,
  label: 'Worlds',
  singleton: true,
  schema: z.strictObject({
    worlds: listOf(z.strictObject({
      id: z.string().meta({ label: 'ID' }),
      name: z.string().meta({ label: 'Name' }),
      levels: listOf(z.string(), { label: 'Levels', minItems: 1 }).optional()
    }), { label: 'Worlds', minItems: 1 }).optional()
  }),
  defaultData: createMonkeyBallTemplate().resources.worlds!.data as Record<string, unknown>
}
```

Polarity notes (from the DSL source, not judgment calls): `waypoints`, `speed`, `mode`, `shape`, `overrides`, `archetypeId`, all `physics` fields, `id`, `name` had `required: true` → plain. `movingPlatform`, `renderable`, `rigidBody`, `radius`/`height` (renderable), `worlds`, `levels` lacked it → `.optional()`.

- [ ] **Step 2: Add the zod dependency**

In `games/monkey-ball/package.json` `dependencies`, add `"zod": "^4.4.3"`.

- [ ] **Step 3: Run the affected suites**

Run: `npx vitest run --project monkey-ball && npx vitest run --project editor-mcp-server`
Expected: PASS — monkey-ball's content tests and the MCP server's real-YAML loading test pin behavior.

- [ ] **Step 4: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add games/monkey-ball/src/project/definition.ts games/monkey-ball/package.json package-lock.json
git commit -m "feat(monkey-ball): author project schemas in zod"
```

---

### Task 9: Wire per-game JSON schemas into MCP tool descriptions

**Files:**
- Modify: `packages/editor/src/project/toolHost.ts`
- Modify: `packages/editor/tests/project/toolHost.test.ts` (add one test)
- Modify: `tools/editor-mcp-server/tests/server.test.ts` (add one test)

**Interfaces:**
- Consumes: `RegisteredEditorProject.componentTypes` / `.resourceTypes` (each spec now carries `jsonSchema?` after Task 4); `toolDefs()` from `@automata/contracts`.
- Produces: project-mode `listTools()` descriptions for data-carrying tools end with `" Component data schemas by typeId: {…}"` and/or `" Resource data schemas by typeId: {…}"` (compact JSON).

- [ ] **Step 1: Write the failing editor test**

Append to `packages/editor/tests/project/toolHost.test.ts` (self-contained fixture; reuse the file's existing imports where they overlap):

```ts
import { z } from 'zod'
import { defineGameProject } from '@automata/project'
import { registerEditorProject } from '../../src/project/registration'

describe('listTools schema decoration', () => {
  const registration = registerEditorProject({
    project: defineGameProject({
      gameId: 'deco', label: 'Deco',
      createTemplate: () => ({
        manifest: { formatVersion: 1, id: 'deco', name: 'Deco', gameId: 'deco', entrySceneId: 'main', scenes: [{ id: 'main', path: 'scenes/main.scene.json' }], resources: [] },
        scenes: { main: { formatVersion: 1, id: 'main', name: 'Main', entities: [] } },
        resources: {}
      }),
      components: [{
        typeId: 'deco.stats', label: 'Stats',
        schema: z.strictObject({ speed: z.number().min(0).meta({ label: 'Speed' }) }),
        defaultData: { speed: 1 }, cardinality: { min: 0, max: 1 }
      }],
      resources: [], validate: () => [], compile: () => ({})
    }),
    prefabs: []
  })

  it('appends per-type JSON schemas to data-carrying tool descriptions', () => {
    const host = createProjectToolHost({ registration, initialSnapshot: registration.createTemplate() })
    const tools = new Map(host.listTools().map((tool) => [tool.name, tool.description]))
    expect(tools.get('addComponent')).toContain('deco.stats')
    expect(tools.get('addComponent')).toContain('"minimum":0')
    expect(tools.get('addComponent')).toContain('core.transform')
    expect(tools.get('setProperty')).toContain('deco.stats')
    expect(tools.get('validate')).not.toContain('deco.stats')
  })
})
```

If the fixture's snapshot shape fights `ProjectSnapshot`'s zod model (`formatVersion` fields, scene entries), copy the minimal working snapshot literal from an existing fixture in the same test file — the assertion block is the contract here.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project editor tests/project/toolHost.test.ts`
Expected: FAIL — descriptions carry no schema text.

- [ ] **Step 3: Implement decoration in `toolHost.ts`**

Add before `createProjectToolHost`:

```ts
/** Which tool descriptions carry which schema map. */
const SCHEMA_SCOPES: Partial<Record<ToolName, 'components' | 'resources' | 'both'>> = {
  addEntity: 'components',
  addComponent: 'components',
  addResource: 'resources',
  setProperty: 'both',
  insertArrayItem: 'both',
  removeArrayItem: 'both',
  moveArrayItem: 'both'
}

function schemaMap(specs: ReadonlyArray<{ typeId: string; jsonSchema?: Record<string, unknown> }>): string {
  return JSON.stringify(
    Object.fromEntries(specs.flatMap((spec) => (spec.jsonSchema ? [[spec.typeId, spec.jsonSchema]] : [])))
  )
}

/** Decorate the generic tool defs with this game's typed data schemas. */
function decorateToolDefs(registration: RegisteredEditorProject): ToolDef[] {
  const components = ` Component data schemas by typeId: ${schemaMap(registration.componentTypes)}`
  const resources = ` Resource data schemas by typeId: ${schemaMap(registration.resourceTypes)}`
  return toolDefs().map((def) => {
    const scope = SCHEMA_SCOPES[def.name as ToolName]
    if (!scope) return def
    const suffix = scope === 'components' ? components : scope === 'resources' ? resources : components + resources
    return { ...def, description: def.description + suffix }
  })
}
```

Inside `createProjectToolHost`, compute once and serve from `listTools`:

```ts
  const { registration } = options
  const decoratedTools = decorateToolDefs(registration)
  // …
    listTools(): ToolDef[] {
      return decoratedTools
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project editor`
Expected: PASS.

- [ ] **Step 5: Add the end-to-end assertion through the real server**

Append to `tools/editor-mcp-server/tests/server.test.ts` (inside the existing `describe`, using its `connected` helper and `pulsebreakProject` path):

```ts
  it('decorates project tool descriptions with per-type JSON schemas', async () => {
    const { host } = await createHeadlessHost({ projectDir: pulsebreakProject })
    const { client, server } = await connected(host)
    try {
      const tools = (await client.listTools()).tools
      const addComponent = tools.find((tool) => tool.name === 'addComponent')!
      expect(addComponent.description).toContain('pulsebreak.spawn-zone')
      expect(addComponent.description).toContain('core.transform')
      const addResource = tools.find((tool) => tool.name === 'addResource')!
      expect(addResource.description).toContain('pulsebreak.tuning')
    } finally {
      await client.close()
      await server.close()
    }
  })
```

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add packages/editor/src/project/toolHost.ts packages/editor/tests/project/toolHost.test.ts tools/editor-mcp-server/tests/server.test.ts
git commit -m "feat(editor): project MCP tools advertise per-type JSON schemas"
```

---

### Task 10: Migrate remaining test fixtures to zod

**Files (the complete list of DSL-authored fixtures feeding `defineGameProject`/spec types — found via `grep -rln "defineGameProject" packages tools games --include='*.ts'` plus `grep -rln "kind: 'object'" packages/*/tests tools/*/tests`):**
- Modify: `packages/project/tests/registration.test.ts` (the DSL `stats` fixture + `goodComponent`)
- Modify: `packages/project/tests/fixtures/sampleProject.ts`
- Modify: `packages/project/tests/validation.test.ts`, `packages/project/tests/edit.test.ts` (any inline DSL spec literals)
- Modify: `packages/editor/tests/fixtures/fakeProject.ts`
- Modify: `packages/editor-agent/tests/fixtures/fakeProject.ts`
- **Explicitly NOT migrated:** `packages/editor/tests/ui/project/propertyControl.test.ts`, `propertyTable.test.ts`, `inspector.test.ts`, `resources.test.ts`, `spatial.test.ts` — these feed IR literals (`PropertySchema`) directly into UI functions. The IR types survive the DSL deletion; those tests stay as they are.

**Interfaces:**
- Consumes: Tasks 1 and 4.
- Produces: no test file passes a DSL `ObjectSchema` literal into `defineGameProject`, `normalizeComponentType`, or a `ComponentTypeInput`/`ResourceTypeInput` position — the precondition for Task 11's type tightening.

- [ ] **Step 1: Port each fixture using the mechanical table**

| DSL construct | zod replacement |
| --- | --- |
| `{ kind: 'object', fields: [...] }` (root or nested) | `z.strictObject({ ... })`; nested objects add `.meta({ label })` |
| `{ key: 'k', label: 'L', kind: 'number', required: true, min: a, max: b, step: s }` | `k: z.number().min(a).max(b).meta({ label: 'L', step: s })` |
| same, without `required: true` | append `.optional()` (meta BEFORE optional) |
| `kind: 'string'` / `multiline: true` | `z.string()` / `.meta({ multiline: true, label })` |
| `kind: 'boolean'` | `z.boolean()` |
| `kind: 'enum', values: [...]` | `z.enum([...]).meta({ label })` |
| `kind: 'color'` | `color({ label })` |
| `kind: 'vec3'` | `vec3({ label })` |
| `kind: 'reference', target, typeIds` | `reference({ target, typeIds, label })` |
| `kind: 'array', presentation: 'list', item, minItems, maxItems` | `listOf(item, { label, minItems, maxItems })` |
| `kind: 'array', presentation: 'table', item, ... }` | `tableOf(item, { ... })` |

Worked example — the `stats` fixture at the top of `packages/project/tests/registration.test.ts` becomes:

```ts
import { z } from 'zod'
import { color } from '../src'

const stats = z.strictObject({
  speed: z.number().min(0).max(20).meta({ label: 'Speed', step: 0.5 }),
  mode: z.enum(['chase', 'kite']).meta({ label: 'Mode' }),
  tint: color({ label: 'Tint' })
})
```

(If Task 4 already introduced a zod `zodStats` in this file, unify on one fixture.) Apply the same table to each listed file; behavior assertions in the tests themselves do not change — if an assertion starts failing, the port broke polarity or a bound, fix the port, not the assertion.

- [ ] **Step 2: Run every affected suite**

Run: `npx vitest run --project project && npx vitest run --project editor && npx vitest run --project editor-agent`
Expected: PASS.

- [ ] **Step 3: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add packages/project/tests packages/editor/tests packages/editor-agent/tests
git commit -m "test: author schema fixtures in zod"
```

---

### Task 11: Delete the DSL

**Files:**
- Modify: `packages/project/src/schema.ts` (delete `validateProperty`, `validateObject`, `validateArray`, `COLOR_RE`, and the now-unused `escapePointerToken` import; KEEP the type union, `PropertyIssue`, `defaultObject`, `collectReferences`)
- Modify: `packages/project/src/registration.ts` (tighten input types; `dataSchema`/`jsonSchema` become required)
- Modify: `packages/project/tests/schema.test.ts` (delete the `describe('property schemas')` block; keep `defaultObject` and `collectReferences` blocks — they operate on IR literals, which remain valid)

**Interfaces:**
- Consumes: Tasks 5–10 (every producer of specs now authors zod).
- Produces: `ComponentTypeInput.schema: ProjectDataSchema` (zod only); `ComponentTypeRegistration.dataSchema: ProjectDataSchema` and `jsonSchema: Record<string, unknown>` (required, not optional); `validateSpecData` drops the DSL branch.

- [ ] **Step 1: Tighten `registration.ts`**

```ts
export type ComponentTypeInput = Omit<ComponentTypeRegistration, 'schema' | 'dataSchema' | 'jsonSchema'> & {
  schema: ProjectDataSchema
}
export type ResourceTypeInput = Omit<ResourceTypeRegistration, 'schema' | 'dataSchema' | 'jsonSchema'> & {
  schema: ProjectDataSchema
}
```

In the two spec interfaces, `dataSchema` and `jsonSchema` lose their `?`. `isDataSchema` and the DSL passthrough branch in both normalizers are deleted (the normalizers always derive). `validateSpecData` becomes:

```ts
export function validateSpecData(
  spec: { schema: ObjectSchema; dataSchema: ProjectDataSchema },
  value: unknown
): PropertyIssue[] {
  return validateDataSchema(spec.dataSchema, spec.schema, value)
}
```

Remove the `validateProperty` import.

- [ ] **Step 2: Shrink `schema.ts`**

Delete `validateProperty`, `validateObject`, `validateArray`, `COLOR_RE`, `isRecord`/`isFiniteVec3` (only used by the deleted validator), and the `escapePointerToken` import. Update the module docblock: the file now holds the **derived** IR (produced by `derive.ts` from zod), `PropertyIssue`, and the IR walkers `defaultObject`/`collectReferences`.

- [ ] **Step 3: Trim `schema.test.ts`**

Delete the `describe('property schemas')` block (every case now lives in `tests/validateData.test.ts` in zod form). Keep `defaultObject` and `collectReferences` blocks unchanged.

- [ ] **Step 4: Chase the compiler**

Run: `npm run typecheck`
Expected: errors ONLY at leftover `validateProperty` imports — there should be none if Tasks 4–10 were complete. Any survivor gets the `validateSpecData` treatment from Task 4 Step 3.6.

- [ ] **Step 5: Run the full suite**

Run: `npm run test`
Expected: PASS across all workspaces.

- [ ] **Step 6: Lint, commit**

```bash
npm run lint
git add packages/project
git commit -m "feat(project)!: delete the ObjectSchema DSL; zod is the single schema source"
```

---

### Task 12: `build-game` prompt + enriched createGame nextSteps

**Files:**
- Create: `packages/contracts/src/prompts.ts`
- Create: `packages/contracts/tests/prompts.test.ts`
- Modify: `packages/contracts/src/workspaceTools.ts` (export `gameSlugSchema`)
- Modify: `packages/contracts/src/index.ts` (add `export * from './prompts'` — check the file for its exact export style first)
- Modify: `tools/editor-mcp-server/src/server.ts` (prompts capability)
- Modify: `tools/editor-mcp-server/src/main.ts` (wire prompts in workspace mode)
- Modify: `tools/editor-mcp-server/src/workspaceHost.ts` (enriched `nextSteps`)
- Modify: `tools/editor-mcp-server/tests/server.test.ts`, `tools/editor-mcp-server/tests/workspaceHost.test.ts`

**Interfaces:**
- Consumes: `createMcpServer(host, options)` shape from `server.ts`; `gameSlugSchema` from `workspaceTools.ts`.
- Produces:
  - `interface PromptArgumentDef { name: string; description: string; required: boolean }`
  - `interface PromptDef { name: string; description: string; arguments: PromptArgumentDef[] }`
  - `interface PromptResult { description: string; messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }> }`
  - `workspacePromptDefs(): PromptDef[]` and `getWorkspacePrompt(name: string, args: unknown): PromptResult`
  - `McpServerOptions.prompts?: { list(): PromptDef[]; get(name: string, args: unknown): PromptResult }`

- [ ] **Step 1: Write the failing contracts test**

`packages/contracts/tests/prompts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getWorkspacePrompt, workspacePromptDefs } from '../src'

describe('workspace prompts', () => {
  it('lists build-game with a required description argument', () => {
    expect(workspacePromptDefs()).toEqual([
      expect.objectContaining({
        name: 'build-game',
        arguments: [
          expect.objectContaining({ name: 'description', required: true }),
          expect.objectContaining({ name: 'name', required: false })
        ]
      })
    ])
  })

  it('expands a description into the full authoring workflow', () => {
    const result = getWorkspacePrompt('build-game', { description: 'a game about dodging meteors' })
    const text = result.messages[0]!.content.text
    expect(result.messages[0]!.role).toBe('user')
    expect(text).toContain('a game about dodging meteors')
    expect(text).toContain('createGame')
    expect(text).toContain('npm install')
    expect(text).toContain('--project games/')
    expect(text).toContain('evaluate')
    expect(text).toContain('npm run ci')
  })

  it('threads a chosen slug into the workflow', () => {
    const text = getWorkspacePrompt('build-game', { description: 'x', name: 'meteor-dodge' })
      .messages[0]!.content.text
    expect(text).toContain('meteor-dodge')
  })

  it('rejects unknown prompts and bad arguments', () => {
    expect(() => getWorkspacePrompt('nope', {})).toThrow(/unknown prompt/i)
    expect(() => getWorkspacePrompt('build-game', {})).toThrow()
    expect(() => getWorkspacePrompt('build-game', { description: 'x', name: 'Bad Name' })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project contracts tests/prompts.test.ts`
Expected: FAIL — no export named `workspacePromptDefs`.

- [ ] **Step 3: Implement `prompts.ts`**

First, in `workspaceTools.ts`, change `const gameSlugSchema` to `export const gameSlugSchema`.

`packages/contracts/src/prompts.ts`:

```ts
import { z } from 'zod'
import { gameSlugSchema } from './workspaceTools'

/**
 * Workspace-mode MCP prompts. `build-game` converts a one-line game
 * description into the full paved-road workflow, so an agent that starts
 * from "make me a game about X" is steered through authoring and
 * evaluation instead of stopping at the scaffold.
 */

export interface PromptArgumentDef {
  name: string
  description: string
  required: boolean
}

export interface PromptDef {
  name: string
  description: string
  arguments: PromptArgumentDef[]
}

export interface PromptResult {
  description: string
  messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }>
}

const buildGameArgsSchema = z.object({
  description: z.string().min(1),
  name: gameSlugSchema.optional()
})

const BUILD_GAME: PromptDef = {
  name: 'build-game',
  description:
    'Turn a one-line game description into the full AutomataEngine workflow: scaffold, install, author over MCP, evaluate, iterate.',
  arguments: [
    { name: 'description', description: 'What the game should be, in plain language.', required: true },
    { name: 'name', description: 'Optional lowercase-slug package name for the new game.', required: false }
  ]
}

export function workspacePromptDefs(): PromptDef[] {
  return [BUILD_GAME]
}

export function getWorkspacePrompt(name: string, args: unknown): PromptResult {
  if (name !== BUILD_GAME.name) throw new Error(`Unknown prompt "${name}"`)
  const { description, name: slug } = buildGameArgsSchema.parse(args ?? {})
  return {
    description: BUILD_GAME.description,
    messages: [{ role: 'user', content: { type: 'text', text: buildGameText(description, slug) } }]
  }
}

function buildGameText(description: string, slug?: string): string {
  const name = slug ?? '<name>'
  return `Build a game in this AutomataEngine workspace from the following description. Work the whole workflow below — do not stop after scaffolding.

Game description:
${description}

Workflow:
1. ${slug ? `Call the createGame tool with name "${slug}".` : 'Pick a lowercase-slug name that fits the description and call the createGame tool with it.'}
2. Run \`npm install\` at the repo root so Node can resolve the new workspace package.
3. The scaffold is a generic "beacon runner" skeleton, not the described game. Rewrite games/${name}/src/sim/sim.ts (keep it a deterministic, fixed-dt, pure step function — no Math.random inside step) and src/game/gameplay.ts to implement the described mechanics, updating the game's tests as you go.
4. Reconnect this MCP server with \`--project games/${name}/public/project\`. In project mode the authoring tools (addEntity, addComponent, addResource, setProperty, ...) carry each component/resource type's JSON schema in their descriptions — author to those schemas.
5. Author the content: place entities in the scene, set the tuning resource, and keep the validate tool returning zero errors.
6. Run the evaluate tool and iterate on tuning until the metrics match the description's intent.
7. Project JSON under public/project is generated — edit src/project/template.ts and regenerate (see the game's README and scripts/) rather than hand-editing JSON.
8. Finish with \`npm run ci\` at the repo root and confirm it is green.

Conventions: gameId === package name === games/<dir> name; schemas are zod authored with @automata/project helpers (vec3, color, reference, listOf, tableOf); \`npm run dev -w ${name}\` serves the game on its assigned port.`
}
```

Add `export * from './prompts'` to `packages/contracts/src/index.ts`.

- [ ] **Step 4: Run the contracts tests**

Run: `npx vitest run --project contracts`
Expected: PASS.

- [ ] **Step 5: Register the prompts capability in the server**

`tools/editor-mcp-server/src/server.ts` — extend the options and handlers:

```ts
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import type { PromptDef, PromptResult } from '@automata/contracts'

export interface McpServerOptions {
  parseArgs?: ParseToolArgs
  resourceUris?: readonly string[]
  /** Optional prompt surface (workspace mode registers build-game). */
  prompts?: {
    list(): PromptDef[]
    get(name: string, args: unknown): PromptResult
  }
}
```

In `createMcpServer`, the capabilities object becomes
`{ capabilities: { tools: {}, resources: {}, ...(options.prompts ? { prompts: {} } : {}) } }`,
and after the existing handlers:

```ts
  const { prompts } = options
  if (prompts) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: prompts.list() }))
    server.setRequestHandler(GetPromptRequestSchema, async (req) => {
      try {
        return prompts.get(req.params.name, req.params.arguments ?? {})
      } catch (error) {
        throw new McpError(ErrorCode.InvalidParams, error instanceof Error ? error.message : String(error))
      }
    })
  }
```

`tools/editor-mcp-server/src/main.ts` — the workspace branch passes the prompt surface:

```ts
import { getWorkspacePrompt, parseWorkspaceToolArgs, workspacePromptDefs } from '@automata/contracts'
// …
    const server = createMcpServer(createWorkspaceHost({ repoRoot }), {
      parseArgs: parseWorkspaceToolArgs,
      resourceUris: [],
      prompts: { list: workspacePromptDefs, get: getWorkspacePrompt }
    })
```

- [ ] **Step 6: Enrich `createGame` nextSteps**

In `tools/editor-mcp-server/src/workspaceHost.ts`, replace the `nextSteps` array:

```ts
          nextSteps: [
            'npm install  (required before Node can import the new workspace package)',
            `npm run dev -w ${plan.name}  (serves the game on port ${plan.port})`,
            `The scaffold is a generic beacon-runner skeleton: rewrite games/${plan.name}/src/sim/sim.ts and src/game/gameplay.ts to implement the intended mechanics, keeping the game's tests green`,
            `Reconnect this MCP server with --project games/${plan.name}/public/project to author content; in project mode the authoring tools carry per-type JSON schemas in their descriptions`,
            'Author entities and resources, keep the validate tool clean, then run evaluate and iterate on tuning until the metrics match the intent',
            'Finish with npm run ci at the repo root'
          ]
```

- [ ] **Step 7: Add server + host tests**

Append to `tools/editor-mcp-server/tests/server.test.ts`:

```ts
import { getWorkspacePrompt, workspacePromptDefs } from '@automata/contracts'

  it('serves workspace prompts when configured', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const server = createMcpServer(fakeHost, {
      resourceUris: [],
      prompts: { list: workspacePromptDefs, get: getWorkspacePrompt }
    })
    const client = new Client({ name: 'prompt-test', version: '0.0.0' })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      expect((await client.listPrompts()).prompts).toEqual([
        expect.objectContaining({ name: 'build-game' })
      ])
      const prompt = await client.getPrompt({
        name: 'build-game',
        arguments: { description: 'a chill fishing game' }
      })
      const text = (prompt.messages[0]!.content as { text: string }).text
      expect(text).toContain('a chill fishing game')
      expect(text).toContain('createGame')
      await expect(client.getPrompt({ name: 'build-game', arguments: {} }))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams })
    } finally {
      await client.close()
      await server.close()
    }
  })
```

In `tools/editor-mcp-server/tests/workspaceHost.test.ts`, update the existing `createGame` result assertion so `nextSteps` expectations match the new six entries (assert `nextSteps` has length 6 and that one entry contains `--project games/` and another contains `evaluate` — keep it resilient to copy tweaks).

- [ ] **Step 8: Run the suites**

Run: `npx vitest run --project contracts && npx vitest run --project editor-mcp-server`
Expected: PASS.

- [ ] **Step 9: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add packages/contracts tools/editor-mcp-server
git commit -m "feat(mcp): build-game prompt and workflow-grade createGame nextSteps"
```

---

### Task 13: Gates, docs, and milestone close-out

**Files:**
- Modify: `AGENTS.md` (schema authoring convention)
- Modify: `docs/superpowers/plans/2026-07-03-schema-unification.md` (check off tasks)

- [ ] **Step 1: Document the authoring convention in AGENTS.md**

Add a "Component/resource schemas" subsection near the existing registry-convention docs:

```markdown
### Component/resource schemas (zod)

Component and resource data schemas are authored in zod v4 (`packages/project`
re-exports the helpers). Rules:

- Roots and nested objects are `z.strictObject({...})`; unknown keys are rejected.
- Scalars are plain zod: `z.number().min(0).max(20).meta({ label: 'Speed', step: 0.5 })`,
  `z.string()`, `z.boolean()`, `z.enum([...])`. Call `.meta()` before `.optional()`.
- Editor kinds use the helpers: `vec3({ label })`, `color({ label })`,
  `reference({ target: 'entity' | 'resource', typeIds?, label })`,
  `listOf(item, { minItems?, maxItems?, label })`, `tableOf(item, {...})`.
  Never call `.meta()` on a helper result — pass the label as an argument.
- Fields are required by default; add `.optional()` for optional ones.
- `defineGameProject` derives the editor UI descriptors and the per-type JSON
  schema (`spec.jsonSchema`) that project-mode MCP tools advertise; anything
  zod can express but the editor can't render fails at registration time.
```

Also update any AGENTS.md sentence that still describes the `ObjectSchema` DSL.

- [ ] **Step 2: Run every gate**

```bash
npm run ci          # lint + typecheck + tests + coverage thresholds
npm run coverage    # confirm 90/90 lines/branches
npm run e2e
npm run verify:new-game   # clean-clone: scaffold → install → ci → build → MCP → e2e (minutes)
```

Expected: all green. `verify:new-game` is the proof that the zod-native scaffold output is registered, playable, MCP-visible, and CI-green.

- [ ] **Step 3: Walk the spec's acceptance criteria**

- `grep -rn "kind: 'object'" games tools/scaffold --include='*.ts'` → no hits (no DSL literals left in games/scaffold).
- `grep -rn "validateProperty" packages games tools --include='*.ts'` → no hits.
- `automata-editor-mcp --project games/pulsebreak/public/project` → `listTools` descriptions include pulsebreak's schemas (pinned by the Task 9 server test).
- `automata-editor-mcp --workspace .` → `prompts/list` shows `build-game`; `prompts/get` embeds the description; `createGame` returns the six-step `nextSteps` (pinned by Task 12 tests).

- [ ] **Step 4: Close out**

```bash
find . -name "* 2*" -not -path "*/node_modules/*"   # must be empty
git add AGENTS.md docs/superpowers/plans/2026-07-03-schema-unification.md
git commit -m "docs: zod schema authoring convention; mark M2 complete"
```

Then update the M2 memory/roadmap note (P2 done; prompt layer shipped; next up: P3 project-file migrations).
