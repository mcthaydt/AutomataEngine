# Editor Host and Render Boundary Hardening Design

## Goal

Remove the remaining editor-policy leak from the engine render contract, split
the generic project editor host into focused controllers, preserve persisted ID
uniqueness across host recreation, and clarify the game loop's simulation and
render timing contracts.

## Scope

This change addresses five confirmed maintenance issues:

1. `RenderPort.setHighlight` is editor-only policy exposed through the engine's
   core render port.
2. `ProjectEditorCore` owns viewport synchronization, interaction commands,
   camera state, and play-mode lifecycle in one module.
3. `GameLoop.tick` clamps elapsed time twice and passes the simulation catch-up
   cap to render hooks instead of actual non-negative wall time.
4. Four empty duplicate directories with a ` 2` suffix remain in the checkout.
5. Prefab placement IDs depend on a host-local counter and only check the active
   scene for collisions.

The change does not alter project schemas, gameplay simulation, editor UI, or
the visual appearance of selection highlighting.

## Render Boundary

The engine's `RenderPort` will contain only general scene rendering operations.
`setHighlight` will move to an `EditorRenderPort` interface owned by
`@automata/editor`. The Three and null renderer implementations may expose the
additional method structurally, but game/runtime code typed against
`RenderPort` will not see editor selection policy.

`ProjectEditorOpts` and project-world synchronization will require an
`EditorRenderPort`. Preview registrations continue accepting `RenderPort`, so
games remain unaware of the editor-only extension.

## Editor Controller Split

`ProjectEditorCore` remains the public facade but delegates to two focused
controllers:

- `ViewportController` owns edit-world synchronization, camera and map state,
  spatial projection, 2D/3D picking, placement, movement, deletion, drawing,
  and the snapshot/scene/selection invalidation cache.
- `PlayModeController` owns validation, compilation, preview creation,
  fixed/render forwarding, entry/exit ordering, mode updates, and preview
  disposal.

The core constructs the shared store and registration, forwards its public API,
and chooses whether each tick goes to play mode or edit mode. Entering play
constructs the preview before suspending the edit viewport. Exiting play
disposes the preview and resumes a fresh edit-world synchronization state.

## Entity ID Allocation

Prefab placement will use a pure allocator that examines entity IDs across all
scenes in the current `ProjectSnapshot`. For a prefab base such as `box`, it
selects the first monotonic suffix above all persisted `box-N` IDs. This removes
host-local counter state and prevents another scene's persisted ID from being
reused after project reload or editor-host recreation.

## Loop Timing

`GameLoop.tick` will separate two values:

- render wall time: the full non-negative elapsed duration passed to
  `render(alpha, frameDt)`;
- simulation catch-up time: wall time capped at `fixedDt * maxSubSteps` before
  it is added to the accumulator.

The accumulator will no longer be clamped a second time. This keeps the spiral
of-death guard, preserves an existing fractional remainder across a stall, and
allows time-based visual systems to observe the real elapsed duration.

## Cleanup

The empty directories `packages/editor/tests 2`,
`packages/editor-agent/tests 2`, `tools/editor-mcp-server/src 2`, and
`tools/editor-mcp-server/bin 2` will be removed. They contain no tracked files
and require no import or package changes.

## Testing and Verification

Implementation will use red-green-refactor cycles:

- renderer tests will prove ordinary `RenderPort` consumers cannot depend on
  editor highlighting while editor renderer values satisfy `EditorRenderPort`;
- controller tests will cover edit invalidation, play lifecycle, failed preview
  construction, and disposal independently of the thin facade;
- placement tests will prove IDs remain unique when matching persisted IDs
  exist in another scene and after host recreation;
- loop tests will prove a long stall reaches render hooks unchanged while fixed
  updates remain capped and fractional accumulator time is preserved.

After focused tests, the required final gates are `npm run coverage` and
`npm run ci` from the repository root.
