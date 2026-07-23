# Phase 5 cycle 5 — AI 3D-prop provider — Design

Status: approved design. Date: 2026-07-22.
Umbrella: [Phase 5 — Asset pipeline](../week-29/2026-07-14-phase-5-asset-pipeline-design.md)
(manifest v2 §3, adapter contract §4, validation §5). Precedent:
[Phase 5 cycle 4 — First AI provider](../week-29/2026-07-17-phase-5-cycle-4-ai-provider-design.md).
Status/sequencing: [`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 5 cycle 5.

A second **extension cycle**. Cycle 4 shipped the first AI provider —
`claude-svg`, text→SVG for the `ui`/`texture` kinds. This cycle extends the
AI seam to the **`model` kind**: `claude-prop`, a Claude API text→prop-recipe
provider that generates the existing **`PropRecipe v1`** JSON format (engine
primitives with local offsets) behind the same `AssetProvider` seam, with the
same `pinned`-by-content-hash determinism. It closes the AI path's `model`
gap and, with it, gives AI-generated props the same **mechanical
visual-family gate** cycle 4 gave SVG. ROADMAP flips Phase 5 back to
`In progress` until this ships.

## 1. Decisions of record

Settled in brainstorming, binding for this cycle:

- **Claude API, text→prop-recipe.** The provider prompts Claude (model
  `claude-opus-4-8`, official `@anthropic-ai/sdk`) for a `PropRecipe v1`
  JSON object for the `model` asset kind. The recipe is the engine's current
  model format (`packages/asset-providers/src/propRecipe.ts`): 1–12
  `box`/`sphere`/`cylinder` parts with local offsets, sizes/radii, and
  colors — small, diffable, hashable, license-clean; the existing model media
  validation applies unchanged. Credentials resolve from the environment
  (SDK-native), exactly as `claude-svg`.
- **Mirror `claude-svg` structurally.** Same package
  (`@automata/asset-providers-ai`), a new `claudePropProvider.ts` module; same
  error taxonomy (`ai-auth-missing`/`ai-refusal`/`ai-malformed-output`), same
  lazy-client pattern, same injectable `MessagesClient`. Shared primitives
  (`AiProviderError`, `MessagesClient`, `isAuthenticationError`) are imported
  from the sibling `claudeSvgProvider.ts` — the only change there is adding
  `export` to `isAuthenticationError`. No `claude-svg` behavior change.
- **Explicit MCP step only.** Generation happens solely through the existing
  `generateAssets` / `regenerateAsset` MCP tools' `provider` argument (added
  in cycle 4). `composeGame` is untouched; the pure compose path never calls
  the network; first-light stays frozen; CI stays fully offline.
- **Pinned-by-content-hash determinism.** LLM output is non-replayable, so
  provenance records `determinism: { kind: 'pinned', contentHash }`.
  Validation verifies bytes against the hash — never a network call. The
  cycle-4 **hash-after-optimization** rule (`buildGeneratedAsset` recomputes
  the hash over final written bytes) already covers props.
- **Palette enforcement extended to models (this cycle).** Today the `model`
  validation branch checks schema + byte budget but *not* palette membership
  (the SVG branch does). This cycle adds palette-membership to the model
  branch via a shared helper, used both at validation and at generation. The
  procedural `propProvider` already emits only palette colors (body = base
  hue, trim = an accent hue, all through `hsl(...)` at the shared saturation/
  lightness), so it keeps passing — pinned by first-light's model-asset
  regression. This makes visual-family consistency mechanical for the AI prop
  path, the direct analogue of cycle 4's SVG palette gate.
- **Mocked SDK + opt-in live smoke.** Unit tests inject a fake client. One
  live smoke test runs only when `ANTHROPIC_API_KEY` is present (skipped
  otherwise, so `npm run ci` never needs the network).

## 2. The provider: `claudePropProvider.ts`

One module in `@automata/asset-providers-ai`, exporting
`createClaudePropProvider(options?: { client?: MessagesClient; model?: string })`
returning a standard `AssetProvider`:

- `id: 'claude-prop'`, `version: '1.0.0'`,
  `cacheKey: 'claude-prop@1.0.0:model=<model>'`, `kinds: ['model']`,
  `fileExtension: () => 'prop.json'` — matching the procedural `propProvider`
  so the model format and path are identical.
- Imports `AiProviderError`, `MessagesClient`, `isAuthenticationError` from
  `./claudeSvgProvider`; imports `sha256Hex`, `svgPaletteColors`,
  `propRecipeSchema`, and the new `propRecipePaletteErrors` (§3) from
  `@automata/asset-providers`.
- `CLAUDE_PROP_MAX_BYTES = MEDIA_BUDGETS.propMaxBytes` (16 KB) — the same
  budget the validator enforces, so a would-be over-budget recipe fails typed
  at generation rather than silently at validation.

`buildPropPrompt(requirement, allowedColors)` → `{ system, user }`:

- *system:* "You generate compact stylized 3D prop recipes for a deterministic
  game asset pipeline. Respond with exactly one JSON object and nothing
  else — no markdown fences, no prose." Then the literal schema: `formatVersion`
  must be `1`; `parts` is 1–12 entries; each part is one of
  `{ primitive: 'box', size:{x,y,z}, offset:{x,y,z}, color }`,
  `{ primitive: 'sphere', radius, offset:{x,y,z}, color }`,
  `{ primitive: 'cylinder', radius, height, offset:{x,y,z}, color }`; every
  `color` must be one of the literal strings `${allowedColors.join(', ')}`;
  sizes/radii/heights are small positive numbers (the prop is ~1–2 units
  tall, centered at the origin on the ground, `offset.y >= 0`).
- *user:* `Design a stylized prop: ${requirement.description}.`

`extractPropRecipe(raw, allowedColors)`:

1. Trim; strip an optional ` ```json `/` ``` ` fence.
2. `JSON.parse` — failure → `AiProviderError('ai-malformed-output', …)`.
3. `propRecipeSchema.parse` — failure → `ai-malformed-output` with the zod
   message (sliced).
4. `propRecipePaletteErrors(recipe, allowedColors)` — non-empty →
   `ai-malformed-output` naming the first off-palette color.
5. Return the canonical serialization
   `${JSON.stringify(recipe, null, 2)}\n` (byte-identical to the procedural
   provider's formatting, so both providers produce the same on-disk shape).

`generate(requirement, ctx)`:

1. `allowedColors = svgPaletteColors(ctx.style)`; build the prompt.
2. `client.messages.create({ model, max_tokens: 4096, system, messages })`;
   map `AuthenticationError` → `ai-auth-missing`; `stop_reason === 'refusal'`
   → `ai-refusal` (both before reading content, exactly as `claude-svg`).
3. Join text blocks; `extractPropRecipe`; encode; enforce
   `CLAUDE_PROP_MAX_BYTES`.
4. Provenance: `provider: 'claude-prop'`, `providerVersion: '1.0.0'`,
   `generator: <model id>`,
   `sourceParams: { model, system, prompt }` (requirement + style info only —
   no secrets), `seed: ctx.seed`, `specVersion: ctx.specVersion`,
   `determinism: { kind: 'pinned', contentHash: sha256Hex(bytes) }`,
   `license: { kind: 'generated', notes: 'AI-generated via the Claude API.' }`.

## 3. Shared palette helper (`asset-providers`)

A new exported pure function in `asset-providers` (co-located with
`propRecipe.ts` or `validateMedia.ts`):

```ts
export function propRecipePaletteErrors(recipe: PropRecipe, allowed: readonly string[]): string[]
```

Returns one message per part whose `color` is not in `allowed` (empty when
all comply). Used by both the AI provider (§2, generation-time typed error)
and `validateAssetMedia` (§4, media-validation finding) — one rule, two call
sites, no duplication.

## 4. Validation: model palette membership

`validateAssetMedia` (`asset-providers/src/validateMedia.ts`) already receives
`style: StyleParams | null` and branches on `kind === 'model'` (schema +
`propMaxBytes`). This cycle adds, in that branch, **when `style` is present**:

```ts
for (const message of propRecipePaletteErrors(recipe, svgPaletteColors(style))) {
  invalid(`Prop recipe "${entry.id}" ${message}`)
}
```

(run after the schema parse succeeds, over the parsed recipe). Mirrors the
SVG branch's `style ? svgPaletteColors(style) : undefined` conditionality —
palette is enforced only when a style is in scope, so style-less callers are
unaffected. The procedural `propProvider` complies by construction; the
first-light regression (§6) pins that no shipped model asset newly fails.

## 5. MCP tool integration

Cycle 4 already added the `provider` argument to `generateAssets` /
`regenerateAsset`, the `AssetToolDeps.namedProviders` map, the unknown-provider
and kind-mismatch errors, and the provider-inclusive regeneration guard. This
cycle needs only:

- `tools/editor-mcp-server/src/sessionHost.ts:62` — extend the injected map to
  `{ 'claude-svg': createClaudeSvgProvider(), 'claude-prop': createClaudePropProvider() }`.
- `tools/editor-mcp-server/src/sessionHost.ts:3` — add `createClaudePropProvider`
  to the `@automata/asset-providers-ai` import.

Routing is then automatic: a `model` requirement with `provider: 'claude-prop'`
resolves and generates; a non-`model` requirement with `provider:
'claude-prop'` hits the existing `provider.kinds` mismatch error; `provider`
omitted stays byte-identical to today (procedural `propProvider`).

## 6. Testing and gates

- `asset-providers-ai` (fake client): recipe entry shape + pinned provenance;
  fence-stripping (` ```json ` and bare); `JSON.parse` failure →
  `ai-malformed-output`; schema failure (e.g. 13 parts, negative radius) →
  `ai-malformed-output`; off-palette color → `ai-malformed-output` naming the
  color; prompt contains the exact allowed palette strings and the schema;
  refusal → `ai-refusal`; auth-error → `ai-auth-missing`; over-budget bytes →
  `ai-malformed-output`.
- `asset-providers`: `propRecipePaletteErrors` (compliant → empty,
  off-palette → one message per bad part); `validateAssetMedia` model branch
  flips an off-palette recipe to a finding while a procedural recipe stays
  clean; `buildGeneratedAsset` recomputes the pinned hash after `optimizeProp`
  for a `claude-prop` entry; `generateGameAssets` output still byte-identical
  (existing regression pin unaffected — no procedural change).
- `editor-mcp-server` assetTools (fake injected `claude-prop`):
  `generateAssets` with `provider: 'claude-prop'` on a `model` requirement
  writes `assets/<id>.prop.json` and a pinned manifest entry;
  `regenerateAsset` preserves references and re-guards under the
  provider-inclusive key; a `ui` requirement with `provider: 'claude-prop'`
  errors with the kind-mismatch message; omitted `provider` stays
  byte-identical.
- **Live smoke** (`asset-providers-ai/tests/live.test.ts`, extend):
  `describe.skipIf(!process.env.ANTHROPIC_API_KEY)` — one real `model` prop
  generation asserting a schema-valid, palette-clean recipe and a matching
  pinned hash. Skipped in CI; runnable on demand.
- Gates: `npm run ci` (offline, green), `npm run verify:new-game`, and
  `games/first-light` untouched (zero compose-path changes; the model-palette
  validation passes on its procedural assets — pinned by a first-light
  validate-all regression). Docs on ship: ROADMAP Phase 5 cycle 5 line +
  phase status; week-28 decomposition phase-map row bumped to `5 completed`.

## 7. Risks

- **Palette/schema non-compliance.** The model may emit off-palette colors or
  a malformed recipe despite instruction — the asset fails typed at generation
  (nothing partial is written) or fails validation and stays unshippable;
  `regenerateAsset` is the retry. Accepted; the failure rate is observable via
  findings.
- **Adding model-palette validation could surface a latent off-palette
  procedural asset.** Mitigation: the procedural `propProvider` provably emits
  only `svgPaletteColors` members, and the first-light validate-all regression
  gates it before ship. If any shipped model asset did fail, that is a real
  visual-family defect the gate is right to catch.
- **Recipe expressiveness ceiling.** `PropRecipe v1` is 1–12 primitives — the
  AI cannot exceed the engine's current model format, which is the point (the
  format, not the provider, bounds fidelity). A richer mesh boundary is a
  future engine change, not this cycle.
- **API/model drift & cost.** The model id is recorded per asset in
  provenance; only explicit MCP calls hit the network (never compose, CI, or
  validation); one prop is one small request. The minimal `MessagesClient`
  interface confines SDK upgrades to the two AI provider modules.
