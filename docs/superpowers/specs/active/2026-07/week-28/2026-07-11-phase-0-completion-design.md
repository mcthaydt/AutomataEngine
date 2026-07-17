# Phase 0 Completion — Platform-Integrity Closeout (Design)

Status: approved for planning. Date: 2026-07-11.

## 1. Purpose & scope

Close out **factory Phase 0 — Platform integrity**: *generated projects survive
engine evolution and long editing sessions.* Phase 0's phase-level scope is
already fixed by the
[Phase 0→8 decomposition](2026-07-11-factory-phase-decomposition-design.md);
P3 (project-file migrations) and P8 (standalone hygiene) shipped. This spec
covers the **three remaining sub-cycles** as one closeout deliverable:

1. Editor entity-ID + render-timing hardening.
2. P4 — richer `@automata/game-kit` (browser-shell extraction + scaffold regen).
3. Save/reopen recovery hardening + longer browser acceptance coverage.

**Explicitly out of scope.** No `GameSpec`, generation, capability packs, or new
generated-output evaluators — those are Phase 1+. This is pure durability and
hygiene of the existing hand-authored pipeline. The entity-ID/render-timing work
is **precautionary hardening to the stated exit criteria**, not a fix for a
specific observed defect.

## 2. Deliverable shape & sequencing

One spec, one branch off `main` (e.g. `phase-0-completion`), three **workstreams**
that each keep their own scope and exit and are independently verifiable — so a
reviewer can reason about them separately and they *could* land as separate
commits/PRs, though the intent is a single closeout.

**Order** (dependency-driven):

1. **WS1 — entity-ID + render-timing hardening** — editor internals; the
   correctness foundation the others assert against.
2. **WS2 — P4 game-kit primitives + scaffold regen** — games + scaffold;
   independent of WS1.
3. **WS3 — save/reopen recovery hardening + longer acceptance coverage** — last,
   so the extended acceptance suite validates *both* WS1's ID guarantees and
   WS2's thinner scaffold.

TDD throughout, per `AGENTS.md`: focused failing tests before implementation on
every behavior change.

## 3. WS1 — Editor entity-ID + render-timing hardening

### Current state

- `uniqueEntityId(scene, base)` (`packages/editor/src/project/host.ts:82`) mints
  IDs from a per-host-session `placeCounter` (`${base}-${++placeCounter}`) with an
  in-scene collision-guard `while` loop. Collision-safe within one scene in one
  session, but the counter resets on reopen and the IDs it produces are
  order/session-dependent rather than a function of project state.
- Component IDs are derived positionally: `${entityId}-c${index}`
  (`host.ts:153`), and the palette's add-component path mints component IDs
  independently (`packages/editor/src/ui/project/palette.ts:60-83`).
- The viewport reconciles on the render tick (`host.ts:105` `tick`), gated by a
  `snapshot !== lastSnapshot` reference check, with a selection-only fast path
  (`applyHighlight`). Per-item change detection is a full `JSON.stringify`
  (`packages/editor/src/project/worldSync.ts:24` `seedKey`) run over **every**
  item on **every** snapshot change.

### Design

- **IDs derive from state, not a hidden counter.** Replace the `placeCounter`
  mechanism with a small **pure allocator**: given a scene and a base, return an
  entity ID absent from that scene (next free numeric suffix over existing IDs).
  Apply the same rule to component IDs — allocate against the entity's existing
  component IDs rather than a bare positional index — and re-key entity + component
  IDs on any duplicate/paste path. Because allocation becomes a pure function of
  current scene state, it is stable across reopen (no counter-reset drift),
  collision-proof within the scene, and undo/redo-safe (redo restores a whole
  immutable snapshot, so no live clash can arise).
- **Render sync stays correct and cheap over long sessions.** Keep the correct,
  cheap `snapshot !== lastSnapshot` reference gate and the selection-only
  `applyHighlight` fast path. Replace `seedKey`'s full `JSON.stringify` with a
  direct field comparison (position, rotation, renderable) so a large scene does
  not re-stringify every entity whenever any single entity changes. Verify that
  entity churn (many adds/removes/re-parents across a session) leaves no stale
  entries in the `current` map and no leaked renderer resources.

### Tests

- Allocator unit tests: next-free-suffix; no collision; stable across a simulated
  reopen; duplicate/paste re-keys; component IDs unique against existing.
- `worldSync` reconciliation tests: add / remove / move / re-parent; highlight-only
  change does not trigger a full re-sync; high-churn run stays bounded (map size
  and world entity count return to expected after add-then-remove).

### Exit

Entity/component ID allocation is deterministic and collision-proof across
reopen, undo/redo, and duplicate; viewport reconciliation stays correct and does
not degrade over long/large-scene sessions; tests cover both.

## 4. WS2 — P4 game-kit browser-shell primitives

### Current state

`games/monkey-ball/src/main.ts` (~199 lines) and `games/pulsebreak/src/main.ts`
(~144 lines) hand-wire the same browser shell: a cleanup stack + `beforeunload`
dispose, canvas + `#overlays` DOM, `createThreeRenderer` + `attachCanvasRenderer`,
`createBrowserAudio` + resume-on-first-`pointerdown` + overlay-click→`uiClick`,
keyboard + virtual-joystick inputs, `GameLoop` + `startLoopDriver` (pause-on-blur),
an Escape pause mapping, a boot-error panel, and a `fetch('/project/…')` reader.
They differ in the *middle*: Pulsebreak builds gameplay + inputs once at boot;
Monkey Ball builds them **per level** inside scene transitions. `@automata/game-kit`
today carries only `view`, `dom`, `browserAudio`, `overlayScene`, `testing`.

### Design — composable primitives (à la carte)

New `@automata/game-kit` modules, each a focused file + unit test, exported from
`packages/game-kit/src/index.ts`. Small, single-purpose pieces the game composes —
chosen over a single `bootGame` orchestrator because the two games genuinely
differ in how they *sequence* these concerns; a declarative config would need
escape hatches to fit Monkey Ball's per-level lifecycle.

- `createGameHost(app)` → `{ app, canvas, overlays, cleanup, dispose, renderBootError }`
  — canvas + `#overlays` DOM, the `createCleanupStack`, the `beforeunload → dispose`
  wiring, and the shared boot-error panel.
- `createProjectReader(baseURI?)` → `{ readText(path) }` — the
  `fetch(new URL('project/' + path, …))` + ok-check, unifying both readers.
- `mountBrowserAudio(host, opts?)` → the `createBrowserAudio` runtime, deferred
  into cleanup, with resume-on-first-`pointerdown` and the overlay-click→`uiClick`
  listener.
- `createStandardInputs(target, cleanup, opts)` → `InputSource[]` (keyboard +
  virtual joystick) that defers disposers into a **caller-supplied** cleanup stack
  — so Pulsebreak calls it once with `host.cleanup` and Monkey Ball calls it
  per-level with the session stack. This caller-supplied-cleanup seam is the
  linchpin that keeps the primitive usable by both lifecycles.
- `startGameLoop({ fixedUpdate, render, canvasRenderer, onBlurPause }, cleanup)`
  → wraps `GameLoop` + `startLoopDriver` + `canvasRenderer.renderFrame()` +
  stop-on-dispose.

**Deliberately left in each `main.ts`** (genuinely game-specific): the scene set,
gameplay lifecycle (MB per-level enter/leave vs PB boot-once), HUD, store, and
the ~6-line Escape pause mapping.

Then **regenerate the scaffold `main.ts` template**
(`tools/scaffold/src/templates/srcFiles.ts`, template around line 134) to compose
these primitives, and refactor both games' `main.ts` onto them.

### Tests

- Per-primitive unit tests in `packages/game-kit/tests`.
- Behavior unchanged: `e2e/game.spec.ts` and `e2e/pulsebreak.spec.ts` stay green.
- `npm run verify:new-game` passes with the thinner scaffold template.

### Exit

A game's `main.ts` wires only game-specific pieces; the shared
boot/loop/input/audio/project-reader shell lives in one place; `verify:new-game`
passes with the thinner template; the two games' e2e specs are unchanged.

## 5. WS3 — Save/reopen recovery hardening + acceptance coverage

### Current state

Recovery already exists. Autosave is debounced at 400 ms per project as canonical
bundle text (`packages/editor/src/project/storage/autosave.ts`,
`installProjectAutosave`); on reopen the editor canonically diffs the autosave
against the opened snapshot and dispatches `recoverSnapshot` when they differ
(`tools/level-editor/src/editorApp.ts:267-273`). An unreadable autosave yields
`null` (`loadProjectAutosave`) so a stale cache never blocks opening. Acceptance
coverage is thin: `e2e/editor.spec.ts` is 18 lines with no save/reopen/recovery
or long-session test.

### Design

- **Make recovery non-silent.** Recovery currently auto-replaces the opened
  project with autosaved content with no user signal. Add a dismissible
  "Recovered unsaved changes from a previous session" notice with a
  **discard-to-disk** action that reloads the on-disk snapshot. *Decision:*
  auto-apply the recovered snapshot and surface the notice (least disruptive, no
  data loss), rather than prompting before applying. Bounded to a notice +
  discard — no versioned recovery history.
- **Verify the durability edges.** Confirm the `installProjectAutosave` disposer's
  pending-debounce flush actually runs on the editor's `beforeunload`/dispose path,
  and that a recovered autosave from an older `formatVersion` rides the
  `parseProjectBundle` migration chain intact.

### Acceptance coverage (extends `e2e/editor.spec.ts`)

1. Save → reopen preserves edits.
2. Edit without saving → reload → changes are recovered (and the notice shows).
3. Long-session test: place / move / delete / undo / redo many entities; assert
   project consistency and no console errors.
4. A scaffolded game boots end-to-end (leans on the `verify:new-game` clean-clone
   proof; asserts the WS2 scaffold change did not regress boot).

### Exit

Save → close → reopen preserves work; unsaved work is recovered on reopen with a
visible, dismissible notice and a discard path; the extended Playwright suite
covers save/reopen/recovery, a long editing session, and a scaffolded-game boot.

## 6. Testing, verification & risks

**Gate before "ready":** `npm run ci`; `npm run coverage` (engine/editor
touched); `npm run verify:new-game`; the extended Playwright suite. TDD on every
behavior change.

**Risks.**
- *`createStandardInputs` cleanup seam (WS2).* The caller-supplied cleanup stack
  is the trickiest interface; Monkey Ball's per-level use is the acid test —
  mitigated by keeping the input *lifecycle* in the game, not the primitive.
- *Recovery UX scope creep (WS3).* Bounded to a notice + discard; no versioned
  history, no diff UI.
- *Over-gilding the ID/sync hardening (WS1).* "Precautionary" means meet the exit
  criteria (survive long sessions), not gold-plate; the field-compare and pure
  allocator are the deliverables, not a broader rewrite.

## 7. Exit criteria & roadmap impact

Phase 0 exits when all three workstreams land, `npm run ci` is green, and the
extended acceptance suite passes. On merge, update
[`/docs/ROADMAP.md`](/docs/ROADMAP.md): move Phase 0 to *Shipped* (with the merge
commit), mark the three sub-cycles and P4 done, and promote **Phase 1 —
Persistent MCP build sessions (P5)** from *Next* to *In progress*.

## 8. References

- Phase decomposition (scope of record):
  [`2026-07-11-factory-phase-decomposition-design.md`](2026-07-11-factory-phase-decomposition-design.md)
  — Phase 0 section and the Phase 0 remaining-sub-cycle backlog.
- Status & sequencing: [`/docs/ROADMAP.md`](/docs/ROADMAP.md) — Phase 0 and §4 P4.
- Conventions: `AGENTS.md` (TDD, registry/scaffold rules, verification commands).
- Key source: `packages/editor/src/project/host.ts`,
  `packages/editor/src/project/worldSync.ts`,
  `packages/editor/src/project/storage/autosave.ts`,
  `tools/level-editor/src/editorApp.ts`,
  `tools/scaffold/src/templates/srcFiles.ts`,
  `games/monkey-ball/src/main.ts`, `games/pulsebreak/src/main.ts`,
  `packages/game-kit/src/index.ts`, `e2e/editor.spec.ts`.
