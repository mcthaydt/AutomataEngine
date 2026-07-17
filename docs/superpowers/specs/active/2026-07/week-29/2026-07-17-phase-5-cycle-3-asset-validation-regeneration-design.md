# Phase 5 cycle 3 — Asset validation, optimization & independent regeneration — Design

Status: approved design. Date: 2026-07-17.
Umbrella: [Phase 5 — Asset pipeline](2026-07-14-phase-5-asset-pipeline-design.md)
(manifest v2 §3, provider contract §4, cycle-3 scope §5). Status/sequencing:
[`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 5 cycle 3.

The closing cycle of the asset pipeline: generated assets become *consumed*
assets (compose wiring, deferred here by cycle 2 by design), the media-level
asset evaluator lands in the gate pipeline, deterministic optimization steps
append to `transformations`, and `regenerateAsset(id)` gives Phase 7 its
repair hook. After this cycle the phase exit criteria are all in force.

## 1. Decisions of record

Settled in brainstorming, binding for this cycle:

- **Compose wiring lands now.** Cycle 2 deliberately kept providers behind a
  standalone orchestrator while Phase 4 edited `game-compose`; that
  parallel-edit constraint has cleared. `compose:game` gains the asset step
  so manifests carry real `references` and assets stop being unconsumed.
- **Validation is per-kind and runs where the gates already run.** The
  asset evaluator is a standard evaluator in the existing gate pipeline —
  not a bespoke script — and it is the only thing that flips
  `generated → validated` or records `failed` with a typed finding.
- **Optimization is deterministic, idempotent, and recorded.** Every step
  appends a `transformations` entry (tool, version, params) and re-runs
  validation. Golden hashes churn only as a reviewed act alongside a
  version bump (cycle-2 precedent).
- **Regeneration is by stable logical ID and touches nothing else.** The
  child-seed independence property pinned in cycle 2 is the mechanism; this
  cycle exposes it as a hash-guarded, seeded-replay step and proves the
  isolation with a byte-level test.

## 2. Compose wiring (`game-compose` + providers)

`composeGame` gains an asset step after section composition: it derives the
game's `AssetRequirement` set from the spec, calls the pure
`generateGameAssets` orchestrator (cycle 2), and threads the results into
the composed output — files under `public/assets/`, entries merged into the
manifest by id, and `references` populated with the consuming file paths
(e.g. `public/project/composition.json` for assets the composition step
wires in), per the manifest-v2 reference convention. The step is seeded
from the same composition seed, so
`compose:game` remains a deterministic, hash-guarded, replayable operation
end-to-end.

first-light recomposes under the new step; its diff (a manifest with real
generated assets and references) is a **reviewed** baseline update, not a
frozen-bit regression — the one intended exception to the frozen rule,
called out here so the plan treats it as an explicit checkpoint.

## 3. Media validation (the asset evaluator)

One evaluator, per-kind checks, wired into the existing gate pipeline
alongside build/test/browser:

- **SVG (`ui`, `texture`):** parses as XML; only `StyleParams.palette`
  colors appear (visual-family consistency, checked mechanically); byte
  size within budget.
- **Prop recipes (`model`):** parse under the recipe schema; ≤12 parts;
  every part maps to a valid `RenderableDef` via `recipeToRenderables`
  (import success by construction — the mapping *is* the runtime path).
- **WAV (`audio`, `music`):** RIFF/fmt/data well-formedness; 22,050 Hz
  mono 16-bit; duration bounds per kind (≤1 s SFX, ≤8 s ambience); peak
  level below clipping.
- **Cross-cutting:** every manifest entry's file exists and hashes match;
  `references` resolve (structural checks from cycle 1 stay where they
  are — this evaluator adds the media layer, it does not duplicate the
  structural one).

Pass flips status to `validated`; fail records a typed finding and
`failed`. The **release gate hard-fails** any release-candidate asset that
is not `validated` — the phase exit criterion, enforced mechanically.

## 4. Optimization

Deterministic steps, each appending to `transformations` and re-validating:

- **SVG:** canonical minification (strip metadata/whitespace, fixed
  decimal places) — output remains canonical text, so byte-stability is
  preserved.
- **WAV:** peak-normalization to a fixed headroom target using the same
  integer/rational arithmetic discipline as the synth (no transcendental
  calls), keeping bit-determinism.
- **Prop recipes:** structural cleanup (drop degenerate parts, canonical
  key order via the repo's canonical serializer).

Optimization is idempotent: running it twice appends nothing new (a step
that would produce identical bytes is skipped). Atlas/packing from the
umbrella's "where applicable" clause is **not applicable** at current asset
counts and is explicitly deferred with a note, not silently dropped.

## 5. Independent regeneration

- **`regenerateAsset { gameId, assetId, seed? }`** MCP tool + session step:
  re-runs exactly that asset's provider behind its stable logical id, using
  the recorded child-seed derivation (`hashStringToSeed(`${seed}:${assetId}`)`).
  Hash-guarded and seeded-replayable like `compose:game`; seed resolution
  follows the cycle-2 `generateAssets` rule (explicit arg → composition
  seed → typed error).
- Regeneration resets the entry to `generated` (fresh provenance,
  transformations cleared), then the evaluator re-validates it — the same
  lifecycle as first generation, so Phase 7's repair loop needs no special
  path.
- **Isolation proof:** a test regenerates one asset and asserts every other
  asset's bytes and manifest entries are unchanged, byte-for-byte — the
  phase exit ("a failed asset regenerates independently") as an executable
  assertion.

## 6. Testing and gates

- Evaluator: per-kind pass and fail fixtures (malformed XML, off-palette
  color, oversize SVG, >12-part recipe, unmappable primitive, bad WAV
  header, over-duration, clipping); finding shape and status transitions.
- Optimization: determinism (same input → same bytes), idempotence (second
  run is a no-op), `transformations` entries recorded, re-validation runs.
- Compose wiring: composed game's manifest carries generated entries with
  populated `references`; same-seed recompose is byte-identical including
  assets; first-light baseline update reviewed and committed.
- Regeneration: byte-level isolation test (§5); hash-guard and seeded
  replay through the session ledger; unknown id and missing-seed typed
  errors.
- Gates: `npm run ci`, `verify:new-game`; the release gate fails a fixture
  workspace containing a `failed` asset and passes once regenerated and
  validated.

## 7. Risks

- **first-light baseline churn.** The compose-wiring diff is intended but
  wide. Mitigation: it is a single reviewed checkpoint in the plan, and
  same-seed recompose determinism is asserted before and after.
- **Evaluator false negatives on palette checks** (e.g. SVG color
  serialization variants). Mitigation: providers emit canonical color
  strings (cycle-2 invariant); the check compares against the same
  canonical form.
- **Optimization invalidating golden hashes across the suite.** Accepted
  and bounded: optimizations run inside the pipeline with recorded
  versions, and goldens update as a reviewed act — same policy as provider
  version bumps.
- **Release-gate strictness stranding WIP games.** The hard-fail applies to
  the release gate only; compose and iterate flows keep working with
  `generated`/`failed` assets so repair (Phase 7) has something to act on.
