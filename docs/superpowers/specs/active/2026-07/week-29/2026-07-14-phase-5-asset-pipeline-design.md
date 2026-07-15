# Phase 5 — Asset pipeline — Design (umbrella)

Status: approved design. Date: 2026-07-14.
Scope source: [Phase 0→8 decomposition](../../2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md) §Phase 5;
status/sequencing: [`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 5.
Strategy source: [Autonomous Game Factory design](/docs/superpowers/specs/archive/2026-07/week-27/2026-07-04-autonomous-game-factory-design.md)
§Core model, §Evaluator taxonomy, §Risks (asset inconsistency, provider dependence).

This is the **phase umbrella spec**: it pins the asset manifest v2 and the
provider-adapter contract that all three cycles build against. Each cycle gets
its own implementation plan; only cycle 1's plan is written with this spec.
Phase 5 runs **in parallel with Phase 4** — disjoint code except
`@automata/contracts`, where this phase owns `assetManifest.ts`.

## 1. Goal and non-goals

**Goal.** A normalized, versioned asset manifest with provider adapters,
provenance, validation, optimization, and stable independent replacement —
exit: **a failed asset regenerates independently, and every release asset has
valid provenance and browser budgets.**

**Non-goals (explicitly deferred).**

- AI-generation providers *now*. First adapters are procedural and local
  (decision of record, §2); the interface is AI-ready by construction.
- Photorealism and unbounded asset counts (envelope non-goals).
- The *content* that references assets (Phase 6).
- Fallback/placeholder assets shipping in a release candidate — explicitly
  forbidden and mechanically enforced (§3, status gate).

## 2. Decisions of record

Settled during brainstorming, binding for all three cycles:

- **Umbrella + per-cycle plans.** This spec pins the manifest and adapter
  contracts; cycles 2 and 3 get their own plans referencing this document.
- **Cycle order:** (1) manifest v2 + provenance model + migration;
  (2) provider-adapter interface + first procedural adapters;
  (3) validation + optimization + independent regeneration.
- **Procedural-first, AI-ready.** First adapters are local deterministic
  generators — parametric SVG/texture generation, primitive-based 3D props,
  synthesized SFX/ambience — fully seeded and replayable, no network, no API
  keys. AI providers slot in later as new adapters without schema change:
  the provenance model distinguishes *recomputable-from-seed* from
  *pinned-by-content-hash* determinism from day one.
- **Manifest is v2 with a migration.** The Phase 3 stub
  (`assetManifest.ts` formatVersion 1, provider hardcoded to
  `'stub-generator'`) is replaced, and first-light's checked-in manifest is
  migrated. The stable logical ID remains the spec `assetRequirement` id.
- **Status gates the release.** Manifest entries carry
  `placeholder | generated | validated | failed`; the release gate hard-fails
  on anything not `validated`. "Diagnostic fallbacks never ship" is a data
  rule, not a policy memo.

## 3. Asset manifest v2

`@automata/contracts` `assetManifest.ts`, `formatVersion: 2`, with a v1→v2
migration. Each entry:

- **`id`** — stable logical ID (= spec `assetRequirement` id); everything
  regenerates behind it, references never change.
- **`requirement`** — what the asset must satisfy: kind, dimensions/budgets,
  style-family key.
- **`provenance`** — provider id + version, generator, source prompt/params,
  seed, spec version, license/generation record, and the determinism mode:
  `{ kind: 'seeded' }` (recomputable) or
  `{ kind: 'pinned', contentHash }` (reproduced by hash check, the future AI
  mode).
- **`transformations`** — ordered record of optimization/conversion steps
  applied (tool, version, params), so any binary is explainable from
  provenance + transformations.
- **`status`** — `placeholder | generated | validated | failed` (§2 gate
  rule). `validated` is set only by the asset evaluator, never by a
  provider.
- **`references`** — which content/pack config paths consume the asset, so
  missing-reference and orphan detection are pure manifest checks.

## 4. Provider-adapter contract

Mirrors the pack pattern (`GamePack` / `pack-registry`):

```ts
interface AssetProvider {
  id: string
  version: string
  kinds: readonly AssetKind[]   // = the spec assetRequirement kind enum:
                                //   'model' | 'texture' | 'audio' | 'music' | 'ui'
  generate(requirement: AssetRequirement, ctx: ProviderContext):
    Promise<{ bytes: Uint8Array; provenance: AssetProvenance }>
}
// ProviderContext: seed, style-family parameters, budgets, output dir
```

A provider registry mirrors `pack-registry`: the only module that knows the
full provider set; generation resolves a requirement's kind + style family to
a provider. Procedural providers must be bit-deterministic from
`(requirement, seed, style params)` — enforced by a replay test per provider.
Visual-family consistency is achieved structurally for procedural providers:
one shared style-parameter set per game feeds every provider call.

First adapters (cycle 2): parametric SVG/texture-material generator,
primitive-based 3D prop generator, synthesized SFX/ambience generator.

## 5. Validation, optimization, regeneration (cycle 3)

- **Asset evaluator** wired into the existing gate pipeline: type and
  dimension checks, poly/texture/audio budgets, import success, missing
  references, visual-family consistency, browser compatibility. Passing
  flips status to `validated`; failing records a typed finding and
  `failed`.
- **Optimization** steps (compression, atlas/packing where applicable)
  append to `transformations` and re-validate.
- **`regenerateAsset(id)`** re-runs exactly that asset's provider behind its
  stable logical ID (hash-guarded step, seeded replay like `compose:game`) —
  the Phase 7 repair loop's regenerate-by-ID hook.

## 6. Cycle 1 scope (plan: 2026-07-14-phase-5-cycle-1-asset-manifest-v2.md)

1. Manifest v2 schema (§3) in `@automata/contracts` with the v1→v2
   migration; first-light's manifest migrated and compose-parity kept green.
2. Provenance model including determinism mode and license record.
3. Manifest read/write helpers + MCP exposure through the existing session
   tooling: list assets, show provenance, query status.
4. Structural manifest validation as the first slice of the asset evaluator:
   schema, duplicate IDs, missing/orphaned references, status rules
   (e.g. `validated` requires provenance). Media-level validation stays in
   cycle 3.

## 7. Exit criteria (phase)

- A failed asset regenerates independently behind its stable ID.
- Every release-candidate asset has valid provenance, passes budgets, and is
  `validated`; the release gate hard-fails otherwise.
- Procedural providers replay bit-identically from recorded seeds.
- Asset validation runs as a standard evaluator in the gate pipeline.

## 8. Risks

- **Procedural quality ceiling.** Stylized-consistent but simple assets;
  acceptable for the envelope's "original stylized 3D" bar until AI adapters
  arrive. Mitigation: the adapter seam makes upgrading a provider a leaf
  change.
- **Determinism drift across platforms** (float/codec variance in
  synthesized audio/geometry). Mitigation: providers emit deterministic
  intermediate representations where possible and the pinned-hash mode is
  the fallback for anything genuinely non-reproducible.
- **Manifest/content reference drift** once Phase 6 generates content at
  scale. Mitigation: `references` validation is structural from cycle 1 and
  runs in every gate.
