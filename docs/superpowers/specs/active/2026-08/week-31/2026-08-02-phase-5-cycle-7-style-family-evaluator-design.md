# Phase 5 cycle 7 — Cross-asset style-family evaluator — Design

Status: approved design. Date: 2026-08-02.
Umbrella spec: [Phase 5 — Asset pipeline](../../2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md)
(manifest v2 §3, provider-adapter contract §4).
Status/sequencing: [`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 5.
Precedent for the manifest migration: cycle 1 (`formatVersion` 1→2).

`packages/contracts/src/assetProvider.ts:7-8` states that "one shared style
context keeps a game's generated asset family coherent." That has always been
an assertion with nothing enforcing it. This cycle makes it checkable.

## 1. The gap

Per-asset palette membership **is** validated today, and correctly: for a
composed game the style is recovered through the fallback chain at
`tools/editor-mcp-server/src/assetTools.ts:365-369`
(`sourceParams.styleSeed` → `composition.source.seed` → `0`), whose middle
branch reproduces exactly the seed `composeGame` used.

What does not exist is **set-level agreement**. Every asset is checked against
*a* style; nothing checks they are all checked against *the same* style. An
asset generated through MCP with `styleSeed: 7` and assets composed under
composition seed 42 each pass independently while the set is incoherent.

## 2. Goal and non-goals

**Goal.** Record style identity as first-class manifest data and add a
set-agreement evaluator that blocks the release gate when a game's assets do
not share one style.

**Non-goals (deferred, each logged in §8).**

- Content-level family measurement — nothing reads bytes to check that the
  colors actually used cluster sensibly.
- Soft or partial similarity. Style identity is exact-match.
- Cross-*game* family consistency.
- Treating provider version or prompt as part of style identity.

## 3. Decisions of record

Settled during brainstorming, binding for this cycle:

1. **Coherence means provenance agreement**, not measured content. Exact,
   deterministic, threshold-free. Threshold-based consistency checks are where
   evaluators earn a reputation for flaky false positives.
2. **Style identity is first-class**, carried in the manifest at
   `formatVersion: 3` — not left in the untyped `sourceParams` record, where
   nothing can enforce its presence.
3. **The manifest records the current style too**, so a mismatch names the
   stale assets instead of reporting a set-level disagreement the operator
   has to diagnose.

## 4. Data model

### 4.1 `computeStyleId`

`computeStyleId(style: StyleParams): string` — sha256 over a canonical
serialization, living in `@automata/asset-providers` beside `sha256Hex` and
`deriveStyleParams`.

`StyleParams` is a plain TypeScript interface
(`packages/contracts/src/assetProvider.ts:10-21`), not a zod schema, so the
canonical form is hand-written with a **fixed field order** rather than
key-sorted — deterministic by construction. The two floats pass through
`toFixed(4)` so no number-formatting variance can reach the hash:

```
base=<baseHue>|accents=<h1,h2>|sat=<0.6000>|light=<0.5000>|wave=<sine>|tempo=<mid>
```

`accentHues` order is preserved, not sorted: `deriveStyleParams` emits it
deterministically, and two styles differing only in accent order are different
styles.

**Division of labour.** `asset-providers` *computes* style ids; `contracts`
only ever *compares* strings. The hashing dependency stays out of `contracts`
and `validateAssetManifest` remains pure with no new imports.

### 4.2 Manifest `formatVersion: 3`

Two added fields, both nullable:

- **`manifest.styleId: string | null`** — the style the game is supposed to
  have.
- **`provenance.styleId: string | null`** — the style each asset was built
  with.

Nullable because `parseAssetManifest` sees only manifest text and a v2→v3
migration cannot invent a hash it has no inputs for. `migrateAssetManifest`
chains v1→v2→v3 behind the existing single parse entry
(`packages/contracts/src/assetManifest.ts:82-109`), backfilling `null` at both
levels.

`null` is not a free pass. It means *unrecorded style*, and §5 treats it as a
release-blocking error exactly as a `placeholder` status is. The nullability
exists so migration is honest about what it cannot know, not so drift can slip
through.

### 4.3 `sourceParams.styleSeed` stays

It answers a different question. `assetTools.ts:365-369` uses it to *re-derive*
real `StyleParams` for palette-membership checks and for regeneration.
`styleId` answers "do these agree"; `styleSeed` answers "how do I rebuild
this." Both are needed.

## 5. The evaluator

Three new codes on `AssetIssue` (the `code` union at
`packages/contracts/src/assetValidation.ts:17-28`), emitted from
`validateAssetManifest`:

- **`asset-style-stale`** — the entry's `styleId` differs from the manifest's.
  The message names the asset, so N stale assets yield N actionable issues.
- **`asset-style-unrecorded`** — the entry is `generated` or `validated` with a
  `null` `styleId`.
- **`manifest-style-unrecorded`** — the manifest's `styleId` is `null`
  (`assetId: null`). This is the only code without the `asset-` prefix; the
  departure is deliberate because it is the only manifest-scoped issue.

**Rules.**

- `placeholder` and `failed` entries are exempt. They already block the release
  by status, and demanding a style id from a placeholder is noise.
- When `manifest.styleId` is `null`, per-asset staleness comparison is skipped
  — there is nothing to compare against — but `asset-style-unrecorded` still
  fires per entry. A migrated v2 manifest therefore reports the root cause once
  plus each asset needing regeneration.

## 6. Integration

**Generation.** `buildGeneratedAsset` stamps
`provenance.styleId = computeStyleId(input.style)` unconditionally. No caller
opt-in is what makes the guarantee hold. `generateGameAssets` returns
`{ assets, styleId }` rather than a bare array so its two callers can set the
manifest-level field without re-deriving the style; `composeGame` and
`assetTools` are both updated.

**Every hardcoded asset-manifest `formatVersion: 2` write site must move to 3.**
There are five, enumerated here because missing one silently strips the
manifest's style or writes an unparseable version:

| File | Line | What it builds |
|---|---|---|
| `tools/editor-mcp-server/src/assetTools.ts` | 117 | empty-manifest default |
| `tools/editor-mcp-server/src/assetTools.ts` | 126 | generated manifest |
| `tools/editor-mcp-server/src/assetTools.ts` | 211 | empty default on the regenerate path |
| `tools/editor-mcp-server/src/assetTools.ts` | 380 | **manifest rebuilt after validation** |
| `packages/game-compose/src/compose.ts` | 76 | composed manifest |

Line 380 is the dangerous one: it reconstructs the manifest from entries alone,
so without `styleId: manifest.styleId` every validate run drops the field.

`packages/contracts/src/assetManifest.ts:84` stays at `2` — it is the *output*
of the v1→v2 migration step, which the new v2→v3 step then consumes.

**Do not touch the other `formatVersion: 2` literals.** Roughly thirty sites
across `packages/project`, `packages/editor`, `games/*`, and `tools/scaffold`
belong to the **project** manifest (`automata.project.json`), an unrelated
schema that shares the number. Only asset manifests move to 3.

**The fallback chain becomes self-checking.** At `assetTools.ts:365-369`, once
a style is recovered, if the entry records a non-`null` `styleId` disagreeing
with `computeStyleId(recovered)`, that is an `asset-style-stale` — the bytes
were built under a different style than the one currently derivable, which also
means the palette check just ran against the wrong palette.

**Release gate: no change required.** `validateAssetManifest`'s issues already
flow through `allIssues` → `errors` → `passed` (`assetTools.ts:355, 387-389`),
so the new errors block the gate automatically.

**`games/first-light`** gains a manifest `styleId` and a real per-asset one — a
reviewed diff over its single asset.

## 7. Testing

- `computeStyleId` determinism, and sensitivity: mutating each of the six
  `StyleParams` fields yields six distinct ids.
- The v1→v2→v3 migration chain through `parseAssetManifest`, asserting `null`
  backfill at both levels.
- Each evaluator rule, including that `placeholder` and `failed` entries are
  exempt and that a `null` manifest style suppresses staleness but not
  `asset-style-unrecorded`.
- `composeGame` parity: the composition is unchanged apart from the new fields.
- The MCP validate round-trip, proving the rewritten manifest keeps its
  `styleId` (the line-378 regression).
- Gates: `npm run ci`, and `npm run coverage` because `contracts` and
  `asset-providers` are coverage-sensitive.

## 8. Capability-gap log (append to the umbrella on ship)

- **Cycle 7 — no content-level family check.** Nothing measures the bytes; a
  provider that ignored its style params but recorded the right `styleId` would
  pass.
- **Cycle 7 — style identity is exact-match.** Any edit to the spec's
  `direction` invalidates every asset at once. This is intended; §3 decision 3
  exists so the resulting error names the stale assets.
- **Cycle 7 — provider version and prompt are not part of style identity.** An
  AI asset regenerated from a different prompt under the same style is coherent.
- **Cycle 7 — no cross-game family notion.** Agreement is scoped to one game's
  manifest.

## 9. Exit criteria

- Manifest `formatVersion: 3` with both `styleId` fields and a working
  v1→v2→v3 chain.
- Every generated asset carries a computed `styleId` with no caller opt-in.
- A manifest mixing two styles fails validation with one `asset-style-stale`
  per stale asset, and the release gate rejects it.
- A migrated v2 manifest reports `manifest-style-unrecorded` plus one
  `asset-style-unrecorded` per non-placeholder asset.
- `npm run ci` and `npm run coverage` pass; `games/first-light` recomposes with
  only the new fields changed.

## 10. Risks

- **A `formatVersion: 2` write site is missed, or a project-manifest one is
  bumped by mistake.** Both are live hazards: the literal appears at five
  asset-manifest sites and ~30 unrelated project-manifest sites. Mitigation:
  §6 enumerates all five explicitly and names the exclusion; the MCP
  round-trip test pins that a validated manifest keeps its `styleId`, and
  `npm run ci` catches a wrongly-bumped project manifest immediately.
- **A direction edit produces a wall of errors.** Accepted and disclosed: it is
  gap 2, and the per-asset messages make the fix mechanical.
- **`toFixed(4)` truncates a meaningful difference.** `deriveStyleParams`
  rounds saturation and lightness to two decimals
  (`packages/asset-providers/src/styleParams.ts:7`), so four is strictly finer
  than any value the pipeline produces; a unit test pins that assumption.

## 11. Docs on ship

- `docs/ROADMAP.md` §3 Phase 5: append cycle 7. Phase 5 stays `Shipped`.
- `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md`:
  Phase 5 counters to 7 cycles.
- Phase 5 umbrella: append §8's gaps to the capability-gap log that Phase 5
  cycle 6 creates.
