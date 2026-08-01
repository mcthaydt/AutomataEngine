# Phase 5 cycle 6 — AI audio/music provider — Design

Status: approved design. Date: 2026-08-01.
Umbrella spec: [Phase 5 — Asset pipeline](../../2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md)
(manifest v2 §3, provider-adapter contract §4).
Status/sequencing: [`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 5.
Precedents: [cycle 4 — `claude-svg`](../../2026-07/week-29/2026-07-17-phase-5-cycle-4-ai-provider-design.md),
[cycle 5 — `claude-prop`](../../2026-07/week-30/2026-07-22-phase-5-cycle-5-ai-prop-provider-design.md).

Phase 5's exit criteria were met at cycle 3, and cycles 4 and 5 extended it with
AI provider adapters for `ui`/`texture` and `model`. This cycle closes the last
kind gap: **`audio` and `music` are the only asset kinds with no AI provider.**

| Kind | Procedural | AI |
|---|---|---|
| `ui`, `texture` | `svgProvider` | `claude-svg` (cycle 4) |
| `model` | `propProvider` | `claude-prop` (cycle 5) |
| `audio`, `music` | `audioProvider` | **this cycle** |

## 1. Goal and non-goals

**Goal.** Ship `claude-audio`, a text→audio-recipe provider for the `audio` and
`music` kinds with pinned-hash determinism and style-membership validation, and
refactor the procedural provider to render through the same shared recipe path.

**Non-goals (deferred, each logged in §7).**

- Chords within a layer, more than two layers, or a percussion track.
- Formats other than PCM WAV at the pipeline's fixed 22050 Hz.
- A cross-asset audio-family evaluator. Style membership is enforced per asset;
  nothing checks that a release's audio set coheres.
- Author-specified BPM. `style.audio.tempo` remains the three-value enum.

## 2. Decisions of record

Settled during brainstorming, binding for this cycle:

1. **Claude emits a structured recipe, never bytes.** The existing deterministic
   synthesiser renders it to WAV, which is what keeps output reproducible.
2. **Two recipe shapes, not one.** SFX stays parametric; music becomes a
   loopable **note motif**. A single parametric recipe would have Claude
   choosing the same numbers the RNG already chooses — the cycle would prove
   plumbing rather than capability.
3. **One shared recipe module and renderer**, used by both the procedural and
   the AI provider, exactly as `propRecipe.ts` is shared today.
4. **Style membership is enforced as an error**, mirroring palette membership
   in cycles 4 and 5. Waveform is the timbre palette Claude must stay inside;
   the motif is the free part.

## 3. Shared recipes and renderer

New module `packages/asset-providers/src/audioRecipe.ts`, sitting where
`propRecipe.ts` sits: schema, renderer, and style validation in one place.

### 3.1 Schemas

- **`SfxRecipe`** — parametric one-shot: waveform, base pitch, sweep, duration,
  decay.
- **`MusicRecipe`** — a loopable motif: base pitch, step duration, and one or
  two layers. Each layer is a sequence of steps, each step either a semitone
  offset from the base or a rest, plus a layer gain.

Both are bounded so that **a schema-valid recipe cannot exceed the existing
`MEDIA_BUDGETS`** (`packages/asset-providers/src/validateMedia.ts:8-14`):
`sfxMaxSeconds: 1`, `ambienceMaxSeconds: 8`, `wavMaxBytes: 400_000`,
`wavPeakMax: 32_000`. Step count × step duration is capped under the ambience
ceiling, and layer gains sum under the peak ceiling. The budget is unreachable
by construction rather than checked after the fact — cycle 5 flagged the
opposite arrangement (`CLAUDE_PROP_MAX_BYTES`, unreachable and therefore
untestable) as a wart in its own plan.

### 3.2 The determinism hazard

A motif needs semitone offsets converted to frequencies, and the natural
expression is `base * Math.pow(2, n / 12)`. **`Math.pow` with a fractional
exponent is implementation-defined** — which is exactly why `detSin` exists in
this codebase (`packages/asset-providers/src/deterministicSine.ts:1-8`).

The renderer therefore uses a **frozen 12-entry table of semitone ratios as
literal constants**, with octave shifts by integer doubling and halving. Every
other operation is IEEE arithmetic plus `detSin`. The WAV stays bit-identical
across platforms, which is what makes the pinned content hash meaningful. A
replay test asserts this, as each shipped provider has.

### 3.3 Renderer and validation surface

- `renderAudioRecipe(recipe, sampleRate): Int16Array` — reuses the existing
  `osc()` for waveform shape and the existing symmetric fade for a clean loop
  seam. `writeWav` is unchanged.
- `audioRecipeStyleErrors(recipe, style): string[]` — the direct analogue of
  `propRecipePaletteErrors`. Waveform must equal `style.audio.waveform`; a music
  recipe's step duration must fall in the band implied by `style.audio.tempo`.
  Shared by both providers; the procedural one passes trivially because it
  derives its recipe from the same style params.

## 4. The providers

### 4.1 `procedural-audio` — refactored, not replaced

Seeds an `SfxRecipe` or `MusicRecipe` from `ctx.seed` and `ctx.style`, then
renders through the shared renderer. Determinism stays `seeded`. Generator ids
bump to `sfx-recipe@1` and `motif-loop@1`, and the recipe rides in
`provenance.sourceParams`.

Music output changes from three detuned drones to a seeded motif. There is no
migration cost: `games/first-light/public/assets/assets.json` contains exactly
one asset, a `ui` SVG from `procedural-svg`, and no checked-in game ships audio.

### 4.2 `claude-audio` — new, in `asset-providers-ai`

Mirrors `claudeSvgProvider` and `claudePropProvider` line for line:

- `id: 'claude-audio'`, `kinds: ['audio', 'music']`, `fileExtension: () => 'wav'`.
- `{ client?, model? }` options with a lazy `resolveClient`.
- Reuses the shared `MessagesClient`, `AiProviderError`, and
  `isAuthenticationError` primitives from `claudeSvgProvider.ts`.
- Prompts for a recipe, extracts and parses it, runs `audioRecipeStyleErrors`,
  and renders through the same shared renderer.

**Determinism is `pinned`,** and it matters more here than for props:
`optimizeAssetBytes` normalizes WAV peaks
(`packages/asset-providers/src/optimize.ts`), so the provider's own bytes are
rewritten downstream. `buildGeneratedAsset` already recomputes the pinned hash
over the *final* bytes — this cycle depends on that existing behavior rather
than adding to it.

### 4.3 Provenance

Because the artifact is bytes rather than the recipe itself, `sourceParams`
carries the full recipe plus the prompt. Provenance and `transformations`
together then explain the binary end to end, which is the property manifest v2
was designed for.

## 5. MCP wiring

One step, exactly as cycle 5 did for `model`: inject the provider in
`sessionHost` and confirm `audio` and `music` route to it. No compose change.

## 6. Testing

- Unit tests against a fake `MessagesClient`. The real SDK is never called in
  the standard suite.
- A recipe→bytes replay test proving bit-identical output.
- Style-error tests: a wrong waveform, and an off-tempo motif.
- A budget test proving no schema-valid recipe can exceed `MEDIA_BUDGETS`.
- An opt-in live smoke appended to the existing
  `packages/asset-providers-ai/tests/live.test.ts`.
- **The regression pin is the `editor-mcp-server` default fixture spec, not
  first-light**, which ships no audio. Cycle 5 wrote its spec against
  first-light, discovered mid-plan that first-light had no model assets, and had
  to retarget; naming the correct target now avoids repeating that.
- Gates: `npm run ci`, and `npm run coverage` because `asset-providers` is
  coverage-sensitive.

## 7. Capability-gap log (append to the umbrella on ship)

- **Cycle 6 — monophonic layers, two maximum.** No chords within a layer and no
  percussion track.
- **Cycle 6 — one sample rate, one format.** PCM WAV at 22050 Hz; no compressed
  formats.
- **Cycle 6 — no cross-asset audio-family evaluator.** Style membership is
  per-asset; nothing checks that a release's audio set coheres.
- **Cycle 6 — tempo bands, not BPM.** `style.audio.tempo` stays a three-value
  enum, so a spec cannot request a specific tempo.

## 8. Exit criteria

- `claude-audio` generates both kinds from text, under style membership, with
  pinned determinism over the final optimized bytes.
- `procedural-audio` renders through the shared recipe path and replays
  bit-identically from its seed.
- The renderer produces bit-identical WAV bytes with no implementation-defined
  math on the audio path.
- `audio` and `music` route to the AI provider through `sessionHost`.
- `npm run ci` and `npm run coverage` pass.

## 9. Risks

- **Claude writes an unmusical motif.** Mitigation: this is a quality ceiling,
  not a correctness failure; the style band and schema bounds keep it inside the
  family, and the provider seam makes upgrading the prompt a leaf change.
- **The semitone table drifts from equal temperament.** Mitigation: the twelve
  constants are pinned by a unit test against their rounded reference values;
  they are data, not computation.
- **Peak normalization interacts badly with layered gains.** Mitigation: the
  schema caps summed gains below `wavPeakMax`, so normalization is a no-op for
  schema-valid recipes; a test asserts the no-op.

## 10. Docs on ship

- `docs/ROADMAP.md` §3 Phase 5: append cycle 6. Phase 5 stays `Shipped` — its
  exit criteria were met at cycle 3 — so only the cycles list and dates move.
- `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md`:
  Phase 5 counters to 6 cycles.
- Phase 5 umbrella: append the four gaps in §7.
