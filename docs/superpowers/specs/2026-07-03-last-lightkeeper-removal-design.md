# Last Lightkeeper Removal Design

## Goal

Remove Last Lightkeeper from the current repository tree as though the game had
never been added. Git history remains intact, but the checked-out source,
documentation, tests, workspace metadata, and developer commands must contain
no product-specific remnants.

## Scope

Delete the complete `games/last-lightkeeper` workspace, its browser end-to-end
test, and its design and implementation-plan documents. Remove root scripts,
README and agent-guide commands, package-lock workspace entries, catalog tests,
and references in broader historical design or plan documents.

The removal also deletes this temporary design document. Generic uses of the
word “lighthouse” outside Last Lightkeeper-specific material are allowed only
if they describe unrelated functionality; product names, package IDs, ports,
commands, paths, and retrospective mentions are not.

## Repository Integrity

The workspace registry is filesystem-driven, so deleting the game directory
removes it from game discovery. Root `package.json` scripts and
`package-lock.json` entries will be reconciled explicitly. Existing unrelated
working-tree changes in `AGENTS.md` and `CLAUDE.md` will be preserved.

## Verification

After removal:

1. A case-insensitive repository search must find no Last Lightkeeper product
   name, package ID, command, path, dedicated port, or e2e test references.
2. The lockfile must describe only existing workspaces.
3. `npm run ci` must pass.

Coverage is not required because no engine production code is changing.
