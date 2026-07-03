# Schema unification: zod single source of truth + agent prompt layer (M2)

Status: draft — awaiting user review. Date: 2026-07-03.

## Motivation

Component and resource data schemas are authored in a custom `ObjectSchema`
DSL (`packages/project/src/schema.ts`): a closed union of nine property kinds
with a hand-rolled validator, defaulter, and reference walker. It works, but:

- It is a second schema language in a repo that already standardized on zod
  v4 for engine data, contracts, and MCP tool argument schemas
  (`packages/contracts` already derives MCP tool JSON schemas via
  `z.toJSONSchema`).
- Agents connecting over MCP see generic tool descriptions: `addEntity` /
  `updateComponent` / `setResource` say nothing about what payload a given
  game's `spawn-point` component actually accepts. The information exists in
  the registration but is locked in a DSL nobody outside the editor reads.
- Every game and the scaffold template must hand-write DSL literals that
  duplicate what a zod schema would express with better typing.

Separately, the prompt-to-game path underdelivers: `createGame` is
deliberately name-only (description-driven generation is the agent's job),
but nothing converts the user's typed description into the deeper authoring
workflow. The tool result's three `nextSteps` strings are the only steering
an agent gets, so it scaffolds the skeleton and stops — it never reconnects
with `--project`, never authors content through the project tools, never
evaluates. M2 fixes both: zod becomes the single source of truth feeding
typed schemas to the MCP surface, and an MCP prompt turns a one-line
description into the full workflow.

## Goals

- Zod v4 is the **only authored schema language** for component/resource
  data. The `ObjectSchema` DSL is deleted as an authoring surface.
- Editor behavior is preserved: same controls, same validation issues (codes
  and JSON pointers), same defaults, same reference collection.
- Per-game component/resource JSON schemas (via `z.toJSONSchema`) are wired
  into the project-mode MCP tool descriptions — agents see exactly what each
  type id accepts.
- Workspace-mode MCP server exposes a `build-game` prompt that expands
  `{ description, name? }` into the full scaffold → install → reconnect →
  author → validate → evaluate workflow; `createGame`'s `nextSteps` carries
  the same workflow summary.
- All gates stay green: `npm run ci` (90% coverage), `npm run build`,
  `npm run e2e`, `npm run verify:new-game`.

## Non-goals

- No project-file migrations (P3) — `formatVersion` stays `z.literal(1)`.
- No game-kit extraction (P4), no `openProject` session tools (P5), no
  llms.txt/API digest (P6), no Last Lightkeeper retrofit (P7).
- No new editor controls or property kinds; the closed nine-kind language is
  preserved, only its authoring representation changes.
- `packages/editor-agent` only needs to keep compiling; P5 decides whether it
  becomes a thin MCP client or is retired.
- `createGame` stays name-only; the prompt layer guides the agent, it does
  not add generation to the tool.

## User-approved decisions

1. **Scope: full P2.** Migrate pulsebreak, scaffold templates, and
   monkey-ball; delete the DSL. No dual-path maintenance left behind.
2. **MCP wiring included.** Derived JSON schemas ship into project-mode tool
   descriptions in M2, not just "derivable."
3. **Authoring API: zod + typed helpers.** Factories for editor-specific
   kinds; plain zod for scalars; typed `.meta()` for editor metadata.
4. **Architecture: derived descriptor IR.** One deriver module walks zod and
   emits the existing closed `PropertySchema` union; the editor UI is
   untouched; zod-internals coupling is contained to that module.
5. **Prompt layer folded into M2** as the final task, so the deep prompt
   ships already backed by typed per-game schemas.

## Design

### D1 — Authoring layer (`@automata/project`)

A new module (`packages/project/src/authoring.ts`, exported from the package
root) provides typed zod factories for the kinds plain zod cannot express
structurally:

- `vec3()` — strict `{ x, y, z }` finite numbers.
- `color()` — `#hex` string (3/4/6/8 digit), same regex as today.
- `reference({ target: 'entity' | 'resource', typeIds? })` — reference id
  string; emptiness/resolution semantics unchanged.
- `listOf(item, { minItems?, maxItems? })` and `tableOf(item, ...)` — arrays
  with `list` / `table` presentation.

Scalars are plain zod: `z.number().min(0).max(20)`, `z.string()`,
`z.boolean()`, `z.enum([...])`. Editor metadata rides on zod v4 `.meta()`
constrained by an exported `ProjectFieldMeta` interface: `label`,
`description`, `step`, `multiline`. Optionality maps `required`, with one
deliberate polarity difference: the DSL is optional-by-default (`required:
true` is opt-in), zod is required-by-default. The port rule is mechanical —
DSL fields with `required: true` become plain zod fields; all others gain
`.optional()` — so validation behavior is preserved field-for-field, and
the parity tests in Testing pin it.

Top-level component/resource schemas are `z.strictObject(...)` — unknown
keys rejected, matching the DSL. `ComponentSpec.schema` and
`ResourceSpec.schema` in `packages/project/src/registration.ts` change from
`ObjectSchema` to the zod object type.

### D2 — Derivation core: the one zod-coupled module

`packages/project/src/derive.ts` walks a zod schema's def graph at
`defineGameProject` time and emits the existing closed `PropertySchema`
union. That union survives as a **derived internal IR** — never
hand-authored again — so `packages/editor/src/ui/project/propertyControl.ts`
and `propertyTable.ts` keep consuming it with near-zero diff.

Mapping (exhaustive; the language stays closed):

| zod construct | IR kind |
| --- | --- |
| `z.number()` (+ min/max checks, `step` meta) | `number` |
| `z.string()` (+ `multiline` meta) | `string` |
| `z.boolean()` | `boolean` |
| `z.enum([...])` | `enum` |
| `color()` helper | `color` |
| `vec3()` helper | `vec3` |
| `reference(...)` helper | `reference` |
| `z.strictObject({...})` | `object` |
| `listOf` / `tableOf` helpers | `array` |

Helper-produced schemas are recognized by a private meta marker the helpers
attach; they are ordinary zod schemas underneath, so `safeParse` and
`z.toJSONSchema` need no special cases. Any construct outside this table
fails registration with the game id and the JSON path of the offending node
— the same closed-language guarantee the DSL enforced by type union, now
enforced by the deriver.

### D3 — Validation, defaults, references

- **Validation.** `validateProperty(schema, value)` is reimplemented as zod
  `safeParse` plus an issue mapper that converts zod issues to the existing
  `PropertyIssue` shape: same `code` strings (`number.min`, `enum.value`,
  `object.unknownKey`, `required`, ...) and the same RFC 6901 JSON pointers.
  Consumers (`packages/project/src/validation.ts`, `edit.ts`, editor UI,
  existing tests) see identical output for identical input.
- **Defaults.** `defaultObject` keeps its kind-based semantics (number ⇒
  `min ?? 0`, enum ⇒ first value, ...), computed from the derived IR.
  Registrations continue to carry explicit `defaultData`, validated at
  registration time exactly as today.
- **References.** `collectReferences` walks the derived IR; behavior
  unchanged.

### D4 — Migration order

1. **Adapter step.** Registration accepts `ObjectSchema | ZodObject`; zod
   schemas go through `derive.ts`, DSL literals pass through. Everything
   stays green; no consumer changes.
2. **pulsebreak** `src/project/definition.ts` → zod helpers.
3. **Scaffold templates** (`tools/scaffold/src/templates/projectFiles.ts`) →
   generate zod-based definitions; `verify:new-game` proves the generated
   game is CI-green end to end.
4. **monkey-ball** `src/project/definition.ts` → zod helpers.
5. **Delete the DSL.** Registration accepts zod only; the hand-rolled
   validator/defaulter in `schema.ts` and the DSL authoring types are
   removed; what remains of `schema.ts` is the derived IR type union,
   `PropertyIssue`, and the IR walkers (`defaultObject`,
   `collectReferences`), plus the new `derive.ts` and issue mapper.

### D5 — MCP schema wiring (project mode)

`createProjectToolHost` (`packages/editor/src/project/toolHost.ts`) already
closes over the loaded registration. Its `listTools()` decorates the
data-carrying tool defs — entity/component/resource add/update tools — with
the game's per-type JSON schemas from `z.toJSONSchema(spec.schema)`,
appended compactly (no pretty-printing) to the tool description, keyed by
type id. Read-only tools (`getSnapshot`, `validateProject`, `evaluate`, ...)
are not decorated. Registration exposes the schema map so the host derives
it once, not per `listTools` call.

### D6 — Prompt layer (workspace mode)

The workspace-mode server (`tools/editor-mcp-server`) registers the MCP
**prompts** capability with one prompt:

- `build-game`, arguments `{ description: string, name?: slug }`.
- Returns a prompt message that embeds: the user's description verbatim; the
  workflow (call `createGame` → run `npm install` → reconnect with
  `--project games/<name>/public/project` → author entities/resources via
  the schema-typed project tools → `validateProject` → `evaluate` → iterate
  tuning until the sim matches the description's intent); and the repo
  conventions that matter to an agent (deterministic sim, tuning resources,
  regen scripts as the sanctioned edit path, `npm run ci` gate).
- The prompt template lives in `packages/contracts` next to
  `workspaceTools.ts` (same derive-don't-duplicate home as the tool
  schemas), so host and server share one definition.

`createGame`'s result `nextSteps` (`tools/editor-mcp-server/src/workspaceHost.ts`)
is enriched with the same workflow summary, so agents that never call the
prompt still get steered past "scaffold and stop." In Claude Code the prompt
surfaces as a slash command; the user's typed description becomes its
argument — this is the "convert what we type into a deeper prompt" fix.

## Testing

- `packages/project/tests/derive.test.ts`: every table row maps correctly;
  meta round-trip (label/step/multiline/presentation); unsupported
  constructs (e.g. `z.union`, `z.record`, non-strict objects) fail with the
  offending path; optional ⇒ `required: false`.
- Issue-mapping parity: port the existing `schema.test.ts` validation cases
  to zod-authored equivalents and assert identical `PropertyIssue` codes and
  pointers. `defaultObject` / `collectReferences` cases likewise.
- Registration: zod-authored `defaultData` mismatches still throw at
  `defineGameProject` time.
- Per-game: both games' content tests (public files load + validate clean)
  pass unchanged through the migration; scaffold's generated-content test
  regenerated with the zod template.
- MCP: project-mode `listTools` includes per-type JSON schemas for the
  loaded game (snapshot-style assertion on one type id); workspace mode
  lists the `build-game` prompt; prompt output snapshot includes the
  description verbatim and the reconnect step.
- Gates: `npm run ci` (lint, typecheck, tests, 90% coverage),
  `npm run build`, `npm run e2e`, `npm run verify:new-game`.

## Risks

- **zod internals.** `derive.ts` walks zod v4 def structures; that coupling
  is contained to one module and zod is pinned `^4.4.3` workspace-wide. If a
  zod upgrade shifts internals, one module absorbs it.
- **Issue-code parity.** zod's native issue codes differ from ours; the
  mapper owns the translation and the parity tests pin it. Divergence shows
  up as test failures, not silent UI changes.
- **Tool-description bloat.** Schemas are compact JSON on data-carrying
  tools only; if a game's schema set grows large enough to hurt, the escape
  hatch is moving full schemas to MCP resources and keeping digests in
  descriptions (not needed at current game sizes).
- **Editor-agent drift.** It compiles against `@automata/project` types; the
  adapter step keeps it green, and it is explicitly not invested in beyond
  compiling.

## Acceptance criteria

- `games/` and `tools/scaffold/` contain no `ObjectSchema`/`PropertySchema`
  literals — definitions author zod only; the DSL validator in
  `packages/project/src/schema.ts` is gone (only the derived IR types and
  IR walkers remain).
- Editor UI renders and validates both games identically to pre-migration
  (existing editor tests unchanged and green).
- `automata-editor-mcp --project games/pulsebreak/public/project`:
  `listTools` descriptions include pulsebreak's component/resource JSON
  schemas.
- `automata-editor-mcp --workspace .`: `prompts/list` shows `build-game`;
  `prompts/get` with a description returns the full workflow prompt;
  `createGame` result carries the enriched `nextSteps`.
- `npm run verify:new-game` passes from a clean clone (zod-native scaffold).
