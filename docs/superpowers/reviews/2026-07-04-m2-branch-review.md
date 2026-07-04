# M2 branch review — schema-unification (main..610f235)

Whole-branch review, high effort: 8 finder angles, verification pass
(finder-executed reproductions counted as confirmation; one candidate refuted
by probe). CI/coverage/e2e/verify:new-game were green at review time,
including after the last-lightkeeper removal commits.

## Confirmed (reproduced by execution)

1. **`listOf(reference(...))` loses the empty-reference check** —
   `packages/project/src/derive.ts` (deriveNode array case): array element
   nodes never get `required` computed (only object fields do), so
   `emptyRequiredReferences` skips them. `validateDataSchema` returns `[]`
   for `''` inside a required reference array where the DSL flagged
   `reference.empty`. Validation regression vs pre-migration behavior.
2. **String `.min()`/`.max()` mis-coded as number issues** —
   `derive.ts` too_small/too_big arms assume non-array means number:
   `z.string().min(1)` on `''` yields `{ code: 'number.min', message:
   'Must be ≥' }` (no bound, wrong code). Also not rejected at derive time,
   unlike exclusive number bounds — silent closed-surface hole. Fix: reject
   string length bounds at derive time OR represent them in the IR/message.
3. **`.int()` / `.multipleOf()` accepted silently, misreported later** —
   registration succeeds with no IR marker; validating `1.5` produces
   `number.type "Expected a finite number"` (1.5 is finite). Should be
   rejected at derive time like exclusive bounds.
4. **vec3 extra-key issues escape the collapse** — `unrecognized_keys` is
   excluded from the vec3-collapse condition, so
   `{ x, y, z, w: 9 }` yields `object.unknownKey` at `/position/w` instead
   of `vec3.type` at `/position`. (Also stricter than the DSL, which
   ignored vec3 extras.) The excluded non-invalid_type disjunct is
   otherwise dead code.
5. **Advertised JSON schema vs validate contract drift for references** —
   `reference()` is plain `z.string()`, so the per-type JSON schema MCP
   agents receive accepts `''`, which `validate` then rejects with
   `reference.empty` (for required refs). Agents authoring to the
   advertised schema hit avoidable validate loops. Fix: encode
   non-emptiness in the helper's zod schema.

## Plausible (code-fact based, not executed)

6. **Stale decorated tool defs** — `packages/editor/src/project/toolHost.ts`
   caches `decorateToolDefs` at host creation while
   `registration.componentTypes`/`resourceTypes` are mutable arrays other
   consumers read live (a test mutates post-construction). Low severity
   today; either freeze the arrays or derive lazily.
7. **Hand-maintained SCHEMA_SCOPES / WRITE_TOOLS tables** — in toolHost.ts,
   `Partial<Record<ToolName,...>>` mirrors of contracts tools; a future
   data-carrying tool silently gets no schema decoration. Deeper home: a
   scope flag on `toolDefs()` in @automata/contracts.
8. **Workflow prose duplicated + scaffold paths unpinned** — the same
   paved-road workflow is hand-written in `contracts/src/prompts.ts`
   (buildGameText) and `editor-mcp-server/src/workspaceHost.ts` (nextSteps);
   the prompt hardcodes scaffold-owned paths (src/sim/sim.ts, template.ts)
   with no test tying them to `planNewGame` output. Two agent entry points
   drift independently.
9. **Duplicated normalize bodies + propagating per-game `num` helpers** —
   `normalizeComponentType`/`normalizeResourceType` are byte-identical;
   every game re-declares `num`/`optionalNum` and the scaffold stamps
   another copy into each new game. One generic normalize + a shared
   numeric-field helper in @automata/project.
10. **validateSpecData does two traversals per call on the editor hot path**
    — zod safeParse + unconditional `emptyRequiredReferences` IR walk per
    command, vs the old single-pass walker; `mapZodIssues` also re-walks
    from the root per issue (O(issues × depth)). Fine at current sizes;
    short-circuit the reference walk for schemas with no reference fields.

## Unranked minors

- Test gaps vs deleted DSL suite: present-but-undefined optional field,
  color.type for non-string values, happy-path valid table/list array.
- Dead `TYPE_CODES.enum` entry + unreachable enum fallback arm in the
  mapper (zod enums always emit `invalid_value`).
- `z.toJSONSchema` for all core components runs at module load on every
  consumer of @automata/project, including game runtime boot (layering).
- editor-agent `tuningRunner.propose()` recreates the tool host (and
  re-stringifies schemas) every tuning iteration.
- authoring.ts doc-comment says `.meta()` on helper results replaces the
  marker — probe shows zod v4 merges; comment is over-cautious (refuted
  candidate, kept here to save the next reviewer the probe).

## Verified clean

Polarity of every ported required/optional field across core, pulsebreak,
monkey-ball, scaffold (field-by-field re-derivation); all validateProperty
call sites migrated; no raw spec literals bypass normalization; project-mode
MCP capabilities unchanged; single zod instance; editor-agent insulated; no
dangling last-lightkeeper references after the removal commits.
