# Phase 5 cycle 2 — Provider adapters + first procedural providers — Design

Status: approved design. Date: 2026-07-16.
Umbrella: [Phase 5 — Asset pipeline](2026-07-14-phase-5-asset-pipeline-design.md)
(manifest v2 §3, provider contract §4). Status/sequencing:
[`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 5 cycle 2.

Cycle 2 of the asset pipeline: the `AssetProvider` contract becomes code, a
provider registry mirrors the pack-registry pattern, and the three first
procedural providers land — parametric SVG/texture, primitive-based 3D prop
recipes, and synthesized WAV SFX/ambience — all bit-deterministic from seed.

## 1. Decisions of record

Settled in brainstorming, binding for this cycle:

- **Standalone seam; `composeGame` untouched.** Providers land behind a pure
  `generateGameAssets` orchestrator plus an MCP `generateAssets` tool.
  `game-compose`, `games/first-light`, and `game-kit` are not modified —
  Phase 4 cycle 2 is concurrently editing `game-compose`, and the phases
  stay code-disjoint. Wiring providers into compose (and regeneration) is
  cycle 3, after the Phase 4 cycle lands.
- **Audio output is WAV** — 16-bit PCM mono, 22,050 Hz. SFX (`audio` kind)
  ≤1 s; ambience loops (`music` kind) ≤8 s. No codecs, no encoder deps.
- **Props are JSON recipes** over the engine's actual render vocabulary
  (`box | sphere | cylinder`), not mesh files — the engine has no mesh
  loader, and adding one is an engine feature, not asset-pipeline work.
- **One `@automata/asset-providers` package** holds the three providers,
  style-parameter derivation, the registry, and the orchestrator. The
  provider *types* live in `@automata/contracts` next to the manifest
  (shared-contracts rule).

## 2. Contracts (`contracts/src/assetProvider.ts`)

Types only — no generation logic in the contracts leaf:

```ts
export type AssetKind = 'model' | 'texture' | 'audio' | 'music' | 'ui'
// exported from the existing assetRequirement kind enum, not redeclared

export interface StyleParams {
  palette: { baseHue: number; accentHues: number[]; saturation: number; lightness: number }
  audio: { waveform: 'sine' | 'triangle' | 'square'; tempo: 'slow' | 'mid' | 'brisk' }
}

export interface ProviderContext {
  seed: number            // per-asset child seed (§4), not the game seed
  style: StyleParams      // one shared set per game — visual-family consistency
  specVersion: number
}

export interface AssetProvider {
  id: string
  version: string
  kinds: readonly AssetKind[]
  fileExtension(requirement: AssetRequirement): string   // additive refinement of the umbrella contract
  generate(requirement: AssetRequirement, ctx: ProviderContext):
    Promise<{ bytes: Uint8Array; provenance: AssetProvenance }>
}
```

`fileExtension` exists so the *orchestrator* owns path construction
(`assets/<id>.<ext>`) — providers never invent paths. Kind coverage is
total: `ui`/`texture` → SVG provider, `model` → prop provider,
`audio`/`music` → audio provider. Every spec-expressible asset requirement
resolves to a provider from this cycle on.

## 3. The three providers (`@automata/asset-providers`)

All providers are pure functions of `(requirement, ctx)`, emit
`determinism: { kind: 'seeded' }`, `license: { kind: 'generated' }`, and
`status`-eligible bytes (the orchestrator stamps `generated`).

- **`svgProvider`** (`ui`, `texture`). Parametric SVG: icons for `ui`
  (seeded geometric emblems), tileable patterns for `texture`. Colors come
  exclusively from `StyleParams.palette`. Output is canonical text — fixed
  decimal places, LF line endings, UTF-8 — so byte-stability is trivial.
- **`propProvider`** (`model`). A zod-schema'd JSON **prop recipe**:
  `{ formatVersion: 1, parts: [{ primitive: 'box' | 'sphere' | 'cylinder',
  …dims, offset: {x,y,z}, color }] }`, at most 12 parts. Generation picks a
  silhouette template (crate, barrel, lamp, stack) from the seed and
  jitters proportions; colors from the palette. Serialized with the repo's
  canonical `JSON.stringify(value, null, 2) + '\n'`. A pure
  `recipeToRenderables(recipe): RenderableDef[]` helper ships in this
  package for future consumers — deliberately NOT in `game-kit` (Phase 4
  owns that package this cycle).
- **`audioProvider`** (`audio`, `music`). Synthesized 16-bit PCM mono WAV
  at 22,050 Hz: seeded oscillator + envelope blips for SFX (≤1 s), layered
  slow oscillators for ambience loops (≤8 s). **No `Math.sin` or any
  transcendental stdlib call** — JS transcendentals are
  implementation-defined and vary across engines. The synth uses a
  polynomial sine approximation built from `+ - * /` only, which IEEE 754
  does guarantee bit-deterministic. This answers the umbrella's
  "determinism drift" risk structurally instead of retreating to
  pinned-hash mode.

**Style derivation.** `deriveStyleParams(direction, seed): StyleParams`
hashes the spec's `direction.visualStyle` / `direction.audioStyle` strings
(engine `hashStringToSeed`) combined with the game seed into palette hues
and audio character. One `StyleParams` per game feeds every provider call —
the umbrella's structural mechanism for visual-family consistency.

## 4. Registry + orchestrator

- **`ASSET_PROVIDERS: Record<string, AssetProvider>`** — the only module
  that knows the full provider set (pack-registry pattern), plus
  `resolveProvider(kind: AssetKind): AssetProvider` (typed error when a
  kind has no provider — unreachable this cycle, guarded anyway).
- **`generateGameAssets(input): Promise<GeneratedAsset[]>`** where
  `input = { requirements: AssetRequirement[]; direction: { visualStyle;
  audioStyle }; seed: number; specVersion: number }` and
  `GeneratedAsset = { entry: AssetManifestEntry; path: string; bytes:
  Uint8Array }`. Pure — no filesystem access; callers write files.
- **Per-asset child seeds:** each asset generates from
  `hashStringToSeed(`${seed}:${assetId}`)`. An asset's bytes depend only on
  its own requirement + child seed, so adding, removing, or regenerating
  one asset never changes another's bytes. This is the property behind the
  phase exit ("a failed asset regenerates independently"), pinned by a
  dedicated test now rather than retrofitted in cycle 3.
- Manifest entries land with `status: 'generated'`,
  `transformations: []`, and `references: []` — nothing consumes these
  files until cycle 3 wires compose; the cycle-1 structural validator
  treats unreferenced assets as warnings, not errors (`validated` remains
  evaluator-only, cycle 3).

## 5. MCP surface

One new tool in the existing asset family (`contracts/src/assetTools.ts` +
`tools/editor-mcp-server/src/assetTools.ts`):

- **`generateAssets { gameId, assetIds?, seed? }`** — reads the asset
  requirements and `direction` from the game's checked-in `gamespec.json`
  (typed error if the game has none), takes all requirements or the
  `assetIds` subset (unknown ids are a typed error), runs
  `generateGameAssets`, writes bytes under the game's
  `public/`, merges entries into `public/assets/assets.json` by id
  (replace-on-id, never duplicate), and returns per-asset
  `{ id, path, provider, status }`.
- **Seed resolution:** explicit `seed` arg → else the game's
  `composition.json` `source.seed` → else a typed error naming both
  options. Same seed ⇒ byte-identical rewrite (idempotent by construction).

## 6. Testing

- Per-provider **bit-replay**: two `generate` calls with the same inputs
  produce byte-equal output; plus a **golden SHA-256** per fixture asset so
  cross-platform drift fails loudly with a hash diff, not a silent flake.
- WAV: header well-formedness (RIFF/fmt/data sizes, 22,050 Hz, mono,
  16-bit), duration bounds per kind.
- Prop recipes: parse under the recipe schema; part count ≤12;
  `recipeToRenderables` maps every part to a valid `RenderableDef`.
- SVG: parses as XML; only palette colors appear.
- Registry: every `AssetKind` resolves to a provider.
- Orchestrator: child-seed **independence** (dropping one requirement
  leaves every other asset's bytes unchanged); entries pass
  `assetManifestSchema` and the cycle-1 structural validator.
- MCP: `generateAssets` over a temp workspace — writes files, merges
  manifest idempotently, honors `assetIds` subsetting and seed fallback.
- Gates: `npm run ci` green; `git status` proof that `game-compose`,
  `game-kit`, and `games/first-light` are untouched.

## 7. Risks

- **Unconsumed outputs.** WAV/prop assets have no runtime consumer until
  Phase 6 content (and cycle 3 compose wiring). Accepted: the cycle's
  deliverable is the seam + deterministic providers; validation of media
  properties (cycle 3) and consumption (Phase 6) are sequenced by design.
- **Polynomial-sine audio quality.** Approximation error is inaudible for
  blips/ambience at this fidelity bar; the approximation is an internal
  detail swappable per provider version bump.
- **Golden hashes churn on intended provider changes.** Accepted cost:
  regenerating goldens is a reviewed, versioned act (provider `version`
  bumps alongside), which is exactly the auditability the provenance model
  wants.
