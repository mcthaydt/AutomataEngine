import type { PackEventBus } from './packEvents'

/**
 * Headless twin of the pack runtime: a pure hook the scripted evaluator drives
 * to complete a pack's objectives deterministically (no DOM, no engine).
 * The optional slices view mirrors the runtime's slice registry: hooks that
 * publish slices make them readable by every other hook each tick.
 */
export type EvalSliceView = Readonly<Record<string, unknown>>

/** Reference to a single hook's own state, given to `connect` for event-driven mutation. */
export interface EvalStateRef {
  get(): unknown
  set(next: unknown): void
}

export interface PackEvalHook {
  packId: string
  createState(): unknown
  /** Subscribe to the shared eval bus and mutate own state via `ref` (contract v2). */
  connect?(bus: PackEventBus, ref: EvalStateRef): void
  /** Next waypoint to seek; null when satisfied or blocked on another pack. */
  nextTarget(state: unknown, player: { x: number; z: number }, slices?: EvalSliceView): { x: number; z: number } | null
  /** `emit` fans out synchronously to connected hooks, mirroring the runtime bus. */
  step(
    state: unknown,
    player: { x: number; z: number },
    slices?: EvalSliceView,
    emit?: (name: string, payload: unknown) => void
  ): unknown
  complete(state: unknown): boolean
  /** Slices this hook's state exposes to other hooks. */
  publishSlices?(state: unknown): Record<string, unknown>
}
