# Phase 3 Post-Review Hardening — Design Amendment

Status: approved design. Date: 2026-07-14.

Amends:

- [Phase 3 — Vertical slice · first playable](./2026-07-13-phase-3-vertical-slice-design.md)
- [Phase 3 Vertical-Slice Hardening](./2026-07-14-phase-3-vertical-slice-hardening-design.md)

## 1. Purpose

The first hardening pass correctly bound slice evidence to current lineage and
introduced a staged compose writer, but post-implementation review reproduced
three remaining boundary failures:

1. distinct binary files can hash identically after UTF-8 replacement decoding;
2. a symlinked directory below a game root can redirect composed writes outside
   that root; and
3. a failed rollback restore is ignored before the only backup is deleted.

This amendment closes those defects without changing the composition format,
session format, compose output set, or supported Phase 3 capability envelope.

## 2. Binding invariants

### 2.1 Content identity hashes bytes

`snapshotFiles` hashes the exact bytes read from every included file. It must not
decode content before hashing or infer hashing behavior from file extensions.
Two files with different byte sequences always contribute different per-file
hashes, including invalid UTF-8 and binary assets.

The snapshot shape remains `Record<string, string>`, so existing session files
remain readable. Existing sessions may observe a one-time content hash change
when their next snapshot includes bytes whose old text-decoded hash differed.
That conservatively marks checks stale and requires them to rerun.

### 2.2 Compose paths reject symlink traversal

Lexical containment remains the first check: normalized targets must remain
below the resolved game root and normalized targets must be unique. Before any
temporary file is written, the writer inspects every existing path component
from the game root through each target parent. Any symbolic link in that chain
rejects the complete write set with `compose-failed`.

The writer deliberately does not support symlinked output directories, even
when a symlink currently resolves inside the game root. Rejecting them avoids
time-of-check/time-of-use races and keeps the compose persistence contract
simple: every output path is represented by real directories owned by the game.

The target itself may be an existing regular file. If the target itself is a
symbolic link, it is also rejected rather than replaced, because accepting it
would make containment depend on filesystem state that the writer does not own.

### 2.3 Rollback never destroys the last recoverable original

When commit fails, rollback still runs in reverse order. Installed replacements
are removed and backups are renamed to their original targets. A backup is
deleted only after its restoration succeeded or after the entire commit
succeeded.

If one or more rollback operations fail, the writer:

1. continues attempting rollback for the remaining entries;
2. retains any backup that could not be restored;
3. removes safe-to-remove staged temporary files;
4. throws an `AggregateError` containing the original commit failure and all
   rollback failures.

The MCP boundary continues mapping that error to a typed `compose-failed`
finding. A failed new write still records no completed `compose:game` step.

## 3. Component changes

### Build session

- Add a byte-oriented hashing helper or extend the existing hash module with a
  `Buffer`-accepting function.
- Make `snapshotFiles` read raw bytes and hash them without text conversion.
- Preserve the existing snapshot keys, directory exclusions, and diff format.

### Editor MCP server

- Extend the narrow composed-writer filesystem port with `lstat`.
- Validate the game root and all existing output path components before staging.
- Reject symlink components as a containment error.
- Track restoration success explicitly and never remove an unrestored backup.
- Aggregate rollback failures while completing all safe cleanup attempts.

No changes are required to compose generation, contracts, manifests, or slice
gate classification.

## 4. Error behavior

- A binary content change produces a new content hash and stales prior checks.
- A symlink in any composed target path returns `compose-failed`; no file is
  written through the symlink and no new compose step is recorded.
- A commit failure with successful rollback restores all originals and removes
  temporary and backup files.
- A commit failure with a failed restore preserves the unrestored backup and
  returns an aggregate failure that identifies both commit and rollback errors.

## 5. TDD acceptance matrix

Each production change follows a focused failing regression:

1. Snapshot two files containing distinct invalid UTF-8 byte sequences and
   assert their hashes differ.
2. Snapshot a binary asset, mutate only its bytes, and assert the snapshot diff
   reports the asset as changed.
3. Create a symlinked target parent pointing outside the game root, invoke
   `writeComposedFiles`, and assert rejection plus absence of the outside file.
4. Create an existing target symlink and assert it is rejected before staging.
5. Inject a commit rename failure followed by a backup-restore failure; assert
   the original backup remains, the other original is restored, and the thrown
   error contains both failures.
6. Run the existing successful rollback test unchanged to preserve cleanup
   behavior when recovery succeeds.

Focused verification runs the `build-session` and `editor-mcp-server` Vitest
projects. Final verification is `npm run ci`, `npm run coverage`,
`npm run verify:new-game`, and `git diff --check`.

## 6. Compatibility and scope

The change is intentionally conservative. It does not add symlink support,
directory-level output swaps, new session fields, manifest changes, or binary
compose outputs. It only makes the existing content and persistence invariants
true for the filesystem cases reproduced by review.
