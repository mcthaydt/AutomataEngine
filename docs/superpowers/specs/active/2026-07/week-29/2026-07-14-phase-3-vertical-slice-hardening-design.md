# Phase 3 Vertical-Slice Hardening — Design Amendment

Status: approved design. Date: 2026-07-14.

Amends: [Phase 3 — Vertical slice · first playable](./2026-07-13-phase-3-vertical-slice-design.md).

## 1. Purpose

The Phase 3 implementation proves the intended spec-to-playable seam, but a
post-implementation audit found that the slice checkpoint does not yet enforce
the lineage and persistence guarantees described by the approved design. In
particular, a current spec can be paired with an older composition, checks can
be reused after content changes, generated assets are absent from content
hashes, asset identifiers can escape the game directory, and a compose step is
recorded before its files are durably committed.

This amendment hardens the existing architecture in place. It does not add a
new factory phase, change the runtime composition format, or widen Phase 3
beyond the `interaction-inventory` slice.

## 2. Binding invariants

### 2.1 Current lineage only

A slice report or decision is valid only when all of the following are true:

1. the current `games/<id>/gamespec.json` has an approved design checkpoint;
2. the selected completed `compose:game` step contains a composition whose
   `source.specHash` equals the current normalized spec hash;
3. every required check was run against the current game content hash; and
4. the decision covers the exact spec, composition, and content hashes in the
   report.

If no matching composition exists, `renderSliceReport` and
`recordSliceDecision` fail with guidance to approve and compose the current
spec. They must never combine a new spec with an older composition.

### 2.2 Current checks only

Build, test, browser, and evaluate steps carry the content hash they checked.
Slice evidence classifies a gate as passed only when the latest applicable step
is completed, successful, and matches the current content hash. A test gate is
release-valid only when it is unscoped; a focused `runTests` invocation cannot
satisfy the slice checkpoint.

Changing known game content marks completed checks stale, regardless of whether
the change came through MCP authoring, compose, spec compilation, or outside the
session. Existing session steps that predate the new content-hash metadata are
treated as stale for checkpoint purposes and must be rerun.

### 2.3 Complete content identity

The content snapshot covers the complete `games/<id>` directory while retaining
the existing exclusions for generated or dependency directories such as
`node_modules`, `dist`, and `coverage`. This includes source, project data,
generated assets, tests, e2e tests, package configuration, and `gamespec.json`.

`sliceCheckpointStatus` compares all three frozen values: `specHash`,
`compositionHash`, and `contentHash`. Any mismatch returns `pending`.

### 2.4 Contained and durable compose writes

Asset requirement IDs use a path-safe identifier grammar. The compose writer
also applies defense in depth: every normalized output target must remain below
`games/<id>`, regardless of where the path originated.

The writer stages the complete output set before replacing any destination.
Commit failures restore already-replaced files from backups and remove staged
temporary files. A new `compose:game` step is recorded only after the output set
has been committed successfully. Filesystem failures produce a typed
`compose-failed` finding and an error result; they never leave a newly completed
ledger step.

Cached compose results remain repairable: the cached deterministic output may
be written again, but a repair failure returns a typed finding without changing
the previously valid recorded step.

### 2.5 Strict tool contracts

The three Phase 3 MCP argument schemas are strict objects. Unknown input keys
are rejected rather than silently stripped, matching the repository-wide zod
contract convention.

## 3. Component changes

### Contracts

- Introduce or reuse a path-safe schema for asset requirement IDs.
- Change compose tool argument roots to `z.strictObject`.
- Extend persisted check results only as needed to carry `contentHash` and test
  scope without invalidating older sessions.

### Build session

- Make `noteContentHash` stale completed check steps when the known hash changes.
- Keep initial hash registration and repeated identical hashes as no-ops for
  staleness.

### Editor MCP server

- Snapshot the full game directory.
- Select a composition only when its source matches the current spec.
- Require current design approval before rendering or deciding the slice.
- Classify gates using their recorded content hash and require an unscoped test
  step.
- Include `contentHash` in slice-checkpoint status matching.
- Move new compose persistence inside the guarded seeded operation and route all
  persistence failures through a typed finding.
- Use a staged, rollback-capable, root-contained writer for composed files.

### Compose engine and slice game

- Continue emitting the same deterministic files and manifest formats.
- Reject unsafe asset identifiers before they can become paths.
- Keep the checked-in `first-light` bytes unchanged.

## 4. Error behavior

The following failures are explicit and actionable:

- current spec not design-approved: `compose-requires-approval`;
- no composition for the current spec: guidance to call `composeGame` after
  design approval;
- stale, missing, failed, or scoped gates: present in the report and block
  approval;
- unsafe output path: `compose-failed`, with no write outside the game root;
- staging or commit failure: `compose-failed`, rollback attempted, no newly
  completed compose step;
- unknown MCP input key: schema-validation error.

## 5. TDD acceptance matrix

Each behavior is introduced by a focused failing regression before production
code changes:

1. Compile v2 after a green v1 checkpoint; report/approval must reject the v1
   composition until v2 is design-approved and composed.
2. Recompose approved v2 after green v1 checks; the report must classify the old
   four gates stale and refuse approval until all four rerun.
3. A focused test run must not satisfy the slice test gate.
4. Changing only `public/assets/item-icon.svg` must change the content hash,
   stale checks, and reopen checkpoint status.
5. `sliceCheckpointStatus` must return pending when only `contentHash` differs.
6. A traversal-shaped asset ID must fail spec validation, and a direct unsafe
   composed path must still be rejected by the writer.
7. An injected staging or commit failure must leave original files intact,
   create a typed finding, and record no new completed compose step.
8. Compose tool arguments with unknown keys must fail parsing.

Focused suites run red then green in their owning Vitest projects. Final
verification is `npm run ci`, `npm run coverage`, `npm run verify:new-game`, and
`npx playwright test`.

## 6. Compatibility and scope

The composition and asset manifest formats remain version 1. The `first-light`
runtime, generated scaffold output, and checked-in composed artifacts do not
change. Older sessions remain readable; old check records simply cannot satisfy
a new slice decision until rerun with current-hash metadata.

This amendment deliberately avoids versioned output directories, pointer-file
swaps, or a general ledger redesign. Those approaches would change the runtime
contract and exceed the bounded hardening needed for Phase 3.
