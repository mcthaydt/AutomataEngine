# Phase 5 cycle 4 — First AI provider adapter — Design

Status: approved design. Date: 2026-07-17.
Umbrella: [Phase 5 — Asset pipeline](2026-07-14-phase-5-asset-pipeline-design.md)
(manifest v2 §3, adapter contract §4, validation §5). Status/sequencing:
[`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 5 cycle 4.

An **extension cycle**: Phase 5 shipped complete at three cycles, but its one
explicitly deferred item — AI-generation providers — is the umbrella's named
next step ("AI providers slot in later as new adapters without schema
change"). This cycle ships the first one: `claude-svg`, a Claude API
text→SVG provider behind the existing `AssetProvider` seam, and with it the
**first real exercise of the `pinned`-by-content-hash determinism mode**
that cycle 1 built and nothing has used. ROADMAP flips Phase 5 back to
`In progress` until this ships.

## 1. Decisions of record

Settled in brainstorming, binding for this cycle:

- **Claude API, text→SVG.** The provider prompts Claude (model
  `claude-opus-4-8`, official TypeScript SDK `@anthropic-ai/sdk`) for
  stylized SVG for the `ui` and `texture` asset kinds. Output is text:
  small, diffable, hashable, license-clean, and the existing SVG media
  validation applies unchanged. Credentials resolve from the environment
  (`ANTHROPIC_API_KEY` or an `ant auth login` profile — SDK-native).
- **Explicit MCP step only.** Generation happens solely through the
  existing `generateAssets` / `regenerateAsset` MCP tools, which gain an
  optional `provider` argument. `composeGame` is untouched; the pure
  compose path never calls the network; first-light stays frozen; CI stays
  fully offline.
- **Pinned-by-content-hash determinism.** LLM output is inherently
  non-replayable (current Opus models accept no sampling parameters at
  all), so the entry's provenance records
  `determinism: { kind: 'pinned', contentHash }`. Replay and validation
  verify bytes against the hash — never a network call.
- **Leaf package + injection.** The provider and its `@anthropic-ai/sdk`
  dependency live in a new `@automata/asset-providers-ai` package.
  `asset-providers` (which `game-compose` imports) stays procedural and
  network-free *by construction*. The MCP server injects the AI provider
  into the asset-tool runner via deps.
- **Palette enforcement unchanged.** The prompt instructs Claude to use
  exactly the allowed style-palette color strings; the existing media
  validator still gates visual-family consistency mechanically. A
  non-compliant SVG lands as `failed` and cannot ship — that is the
  pipeline working, not a validator to loosen.
- **Mocked SDK + opt-in live smoke.** Unit tests inject a fake Anthropic
  client. One live smoke test runs only when `ANTHROPIC_API_KEY` is
  present (skipped otherwise, so `npm run ci` never needs the network).

## 2. The provider: `@automata/asset-providers-ai`

One module, `claudeSvgProvider.ts`, exporting
`createClaudeSvgProvider(options?: { client?: MessagesClient; model?: string })`
returning a standard `AssetProvider`:

- `id: 'claude-svg'`, `version: '1.0.0'`, `kinds: ['texture', 'ui']`
  (mirroring the procedural `svgProvider`), `fileExtension` `'svg'`.
- `MessagesClient` is a minimal structural interface
  (`{ messages: { create(params): Promise<...> } }`) so tests inject a
  fake; the default lazily constructs `new Anthropic()` on first use.

`generate(requirement, ctx)`:

1. Builds a system + user prompt from the requirement (kind, description,
   dimensions) and the shared `StyleParams`, embedding the **exact allowed
   color strings** from `svgPaletteColors(style)` and the instruction to
   output only a single `<svg>` document, nothing else.
2. Calls `client.messages.create({ model, max_tokens: 4096, ... })`.
   Checks `stop_reason === 'refusal'` before reading content. Extracts the
   SVG (strips markdown code fences, requires the payload to start with
   `<svg`), enforces a 64 KB byte-size cap.
3. Emits provenance: `provider: 'claude-svg'`,
   `providerVersion: '1.0.0'`, `generator: <model id>`,
   `sourceParams: { model, prompt }` (requirement + style info only — no
   secrets; keeps every binary explainable per the manifest contract), the
   orchestrator's child `seed` and `specVersion`,
   `determinism: { kind: 'pinned', contentHash: sha256Hex(bytes) }`,
   `license: { kind: 'generated', notes }`.
4. Fails typed, never silently: `ai-auth-missing` (mapped from the SDK's
   `AuthenticationError`), `ai-refusal`, `ai-malformed-output`.

**Hash-after-optimization rule.** The orchestration pipeline runs
`optimizeAssetBytes` after the provider returns, so a provider-computed
hash could cover pre-optimization bytes. The shared helper (§3) therefore
**recomputes `contentHash` over the final written bytes** whenever
determinism is pinned — the manifest hash always matches what is on disk.

## 3. Shared orchestration helper (`asset-providers` refactor)

`generateGameAssets`'s per-asset loop body is extracted into an exported
`buildGeneratedAsset(requirement, provider, { seed, style, specVersion })`
— provider call → optimize (appending to `transformations`) → path →
manifest entry (status `'generated'`), applying the §2 pinned-hash
recompute. A small `sha256Hex(bytes)` helper is exported alongside (used
by the AI package and by validation, §5). `generateGameAssets` keeps its
exact current behavior — procedural, pure, **byte-identical output**,
pinned by a regression test.

## 4. MCP tool integration

- `assetToolArgSchemas` (contracts): `generateAssets` and
  `regenerateAsset` gain `provider: z.string().min(1).max(60).optional()`;
  tool descriptions updated to mention the AI path.
- `AssetToolDeps` (`tools/editor-mcp-server/src/assetTools.ts`) gains
  `namedProviders?: Record<string, AssetProvider>`; the server wiring
  injects `{ 'claude-svg': createClaudeSvgProvider() }`.
- Execution with `provider` present: resolve from `namedProviders`
  (unknown id → error listing known ids; requirement kind not in
  `provider.kinds` → typed error), derive the same child seed as the
  procedural path (`hashStringToSeed` over `"<seed>:<assetId>"`) and the
  same `deriveStyleParams` output, route through `buildGeneratedAsset`. File writes,
  manifest merge, and reference preservation are the existing code paths.
- The `regenerateAsset` guarded-step input gains the provider id, so
  hash-guarding distinguishes procedural from AI regeneration.
- `provider` omitted → behavior byte-identical to today. `listAssets`
  already surfaces provenance (including determinism) — no change.

## 5. Validation: the pinned-hash check

`validateAssetMedia` (in `asset-providers`; already receives entry +
bytes) gains one check: when
`entry.provenance.determinism.kind === 'pinned'`, compare
`sha256Hex(bytes)` to the recorded `contentHash`; mismatch →
`{ severity: 'error', code: 'asset-hash-mismatch' }` and the entry goes
`failed`. This is the pinned mode's replay guarantee: tampered or stale
bytes can never reach `validated`. All existing media checks (SVG
well-formedness, palette membership, budgets) apply to AI SVGs unchanged.

## 6. Testing and gates

- `asset-providers-ai` (fake client): entry shape and pinned provenance;
  fence-stripping and `<svg` enforcement; prompt contains the exact
  allowed palette strings; refusal → `ai-refusal`; garbage output →
  `ai-malformed-output`; auth-error mapping.
- `asset-providers`: `sha256Hex`; `buildGeneratedAsset` recomputes the
  pinned hash after optimization; `generateGameAssets` output
  byte-identical to before the refactor (regression pin).
- `editor-mcp-server` assetTools (fake injected provider):
  `generateAssets` with `provider` writes the file and a pinned manifest
  entry; `regenerateAsset` preserves references and re-guards under the
  provider-inclusive key; unknown-provider and kind-mismatch errors;
  `validateAssets` flips a matching pinned entry to `validated` and a
  tampered one to `failed` with `asset-hash-mismatch`; omitted `provider`
  stays byte-identical (existing tests pass untouched).
- **Live smoke** (`asset-providers-ai/tests/live.test.ts`):
  `describe.skipIf(!process.env.ANTHROPIC_API_KEY)` — one real `ui` icon
  generation asserting a well-formed SVG and a matching pinned hash.
  Skipped in CI; runnable on demand.
- Gates: `npm run ci` (offline, green), `npm run verify:new-game`, and
  `games/first-light` untouched — zero compose-path changes plus the §3
  regression pin make this structural.
- Docs on ship: ROADMAP Phase 5 cycle 4 line + phase status back to
  `Shipped`; phase-map table row (week-28 decomposition doc) bumped to
  `4 completed`.

## 7. Risks

- **Palette non-compliance.** The model may emit colors outside the
  allowed set despite instruction — the asset fails validation and stays
  unshippable; `regenerateAsset` is the retry. Accepted; the failure rate
  is observable via findings.
- **API/model drift.** The model id is recorded per asset in provenance,
  so old assets stay attributable; the minimal client interface confines
  SDK upgrades to one module.
- **Cost/network discipline.** Only explicit MCP calls hit the network —
  never compose, CI, or validation. A single icon generation is one small
  request.
- **Refusal/quality variance.** Typed `ai-refusal` and
  `ai-malformed-output` errors surface cleanly through the MCP tool
  result; nothing partial is ever written.
