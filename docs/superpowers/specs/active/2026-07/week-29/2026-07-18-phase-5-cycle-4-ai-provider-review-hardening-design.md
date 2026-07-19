# Phase 5 Cycle 4 — AI provider review hardening — Design

Status: approved remediation design. Date: 2026-07-18.
Parent design: [First AI provider adapter](2026-07-17-phase-5-cycle-4-ai-provider-design.md).
Parent plan: [`2026-07-17-phase-5-cycle-4-ai-provider.md`](../../../../plans/active/2026-07/week-29/2026-07-17-phase-5-cycle-4-ai-provider.md).

This review-hardening pass closes the security, consistency, and failure-safety
gaps found after Phase 5 Cycle 4 shipped. It does not add another provider or
change the procedural compose path. Every behavior change lands through an
observed red/green regression cycle.

## 1. Decisions of record

- **Validate SVG with an XML parser and a strict allowlist.** A small,
  production XML parser dependency belongs in `@automata/asset-providers`.
  Shared validation accepts only the SVG elements and attributes needed by the
  procedural and Claude providers, rejects active content, event handlers,
  external references, declarations, and unknown markup, and validates colors
  regardless of quote style. The Claude adapter runs the same validation before
  returning bytes; release validation runs it again from disk.
- **Integrity never depends on a GameSpec.** Pinned hashes, media structure, and
  byte budgets are always checked. Palette checks run when style direction is
  available. A legacy game without `gamespec.json` therefore cannot promote
  tampered pinned bytes to `validated`.
- **Persist the style seed only where it is needed.** Named-provider generation
  records the root style seed in provenance `sourceParams.styleSeed` through an
  optional `buildGeneratedAsset` input. Procedural generation omits it and
  remains byte-identical. Validation prefers the recorded style seed and falls
  back to the composition seed for existing entries.
- **Preserve manifest-owned references.** Replacing a generated entry carries
  forward the matching existing entry's `references`; unrelated entries retain
  their existing order and content.
- **Preflight before cost or mutation.** Named-provider kind compatibility and
  the existing manifest are validated before any provider call. All output is
  written to sibling temporary files first, assets are atomically renamed, and
  the manifest is renamed last. A failure can never publish a manifest that
  points at unstaged output; pinned validation detects any asset/old-manifest
  mismatch if a late rename fails.
- **Guard the provider configuration, not only its id.** `AssetProvider` gains
  an optional stable `cacheKey`. The Claude adapter includes provider id,
  version, and model; other named providers fall back to id plus version. MCP
  guarded regeneration inputs use this fingerprint.
- **Keep typed errors typed.** The session host preserves an error object's
  string `code` and `message` in failed tool content. Unknown-provider and
  unsupported-kind failures use the same typed shape. Unexpected errors still
  degrade to a message string.
- **Describe replayability accurately.** Tool descriptions distinguish seeded
  procedural idempotency from non-replayable named generation pinned by hash.

## 2. SVG safety boundary

`@automata/asset-providers` exposes one pure SVG document validator consumed by
both `validateAssetMedia` and `@automata/asset-providers-ai`. The parser must
produce exactly one root `svg` element and no parser errors. Processing
instructions and document-type declarations are rejected.

The allowlist covers the current providers' output: `svg`, `g`, `defs`,
`pattern`, `rect`, `circle`, `ellipse`, `polygon`, and `path`. Attributes are
limited to namespace and geometry fields used by those elements, transforms,
paint (`fill`, `stroke`, `stroke-width`, line joins/caps, opacity), and local
pattern references. Any attribute beginning with `on`, any `style`, unknown
attribute or element, and any non-local URL is rejected. `href`/`xlink:href`
may reference only an in-document fragment. Paint values may be `none`, an
allowed literal palette color, or `url(#local-id)`; palette enforcement is
skipped only when no style is available.

The Claude provider maps any shared SVG validation failure to
`ai-malformed-output`, so unsafe output is rejected before filesystem writes.
The disk validator reports the existing `asset-media-invalid` issue code.

## 3. Generation and persistence flow

For both `generateAssets` and `regenerateAsset`:

1. Parse tool arguments, GameSpec, composition seed, and existing manifest.
2. Resolve the provider and preflight every selected requirement kind.
3. Generate all bytes without filesystem mutation.
4. Merge entries while retaining existing references.
5. Serialize and schema-validate the complete manifest.
6. Stage every asset and the manifest to unique sibling temporary files.
7. Rename staged assets into place, then rename the manifest last.
8. Clean up remaining temporary files on success or failure.

This ordering prevents malformed manifests and unsupported mixed-kind requests
from spending AI tokens or changing files. Atomic sibling renames avoid partial
file contents; committing the manifest last preserves a conservative release
gate if a late filesystem error occurs.

## 4. Validation seed and legacy behavior

`buildGeneratedAsset` accepts optional `styleSeed`. When supplied, it adds the
number to the provider's existing `sourceParams`; it does not alter the provider
seed, generator, hash, or procedural output. Named MCP generation supplies the
root seed used by `deriveStyleParams`.

During validation, each entry resolves its palette seed independently:

1. finite numeric `entry.provenance.sourceParams.styleSeed`;
2. `composition.source.seed` for existing procedural and older named entries;
3. zero only when a spec exists but neither source records a seed.

No spec means no palette reconstruction, but hash, structure, allowlist, and
budget checks still execute.

## 5. Error and cache contracts

Provider-selection failures expose stable codes:

- `asset-provider-unknown`
- `asset-provider-kind-unsupported`

`AiProviderError` codes continue unchanged. The session host converts coded
errors to `{ code, message }` rather than flattening them. Regeneration's guarded
input includes the selected provider fingerprint. The Claude fingerprint changes
when its model or adapter version changes, preventing a prior guarded result from
masking a configuration change.

## 6. TDD coverage and gates

Focused red/green regressions cover:

- pinned tampering without `gamespec.json`;
- scripts, event handlers, unknown elements/attributes, external URLs,
  multi-root markup, and single-quoted off-palette colors;
- unsafe Claude output rejected before provider return;
- `generateAssets` retaining composition references;
- explicit generation seed differing from the composition seed;
- zero provider calls when any selected kind is unsupported;
- malformed existing manifests causing zero provider calls and zero asset
  changes;
- staged-write cleanup and manifest-last behavior on an injected write failure;
- provider model/version cache fingerprinting;
- typed error content through `createSessionHost`;
- corrected procedural-versus-pinned tool descriptions.

Verification runs focused package tests after each cycle, then
`npm run ci` and `npm run verify:new-game`. Engine code is untouched, so
`npm run coverage` is not required by `AGENTS.md`. The parent implementation
plan gains a review-hardening appendix whose checked steps and overall
percentage are updated immediately as work lands.

## 7. Scope exclusions

- No provider retry policy, output repair, or automatic regeneration.
- No changes to `composeGame`, first-light, or procedural golden assets.
- No generalized filesystem transaction framework beyond this asset write path.
- No SVG rendering or visual-quality scoring; this pass enforces safety and the
  existing mechanical release contracts only.
