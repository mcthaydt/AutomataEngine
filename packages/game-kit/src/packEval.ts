/**
 * Headless twin of the pack runtime: a pure hook the scripted evaluator drives
 * to complete a pack's objectives deterministically (no DOM, no engine).
 * The optional slices view mirrors the runtime's slice registry: hooks that
 * publish slices make them readable by every other hook each tick.
 */
export type EvalSliceView = Readonly<Record<string, unknown>>

export interface PackEvalHook {
  packId: string
  createState(): unknown
  /** Next waypoint to seek; null when satisfied or blocked on another pack. */
  nextTarget(state: unknown, player: { x: number; z: number }, slices?: EvalSliceView): { x: number; z: number } | null
  step(state: unknown, player: { x: number; z: number }, slices?: EvalSliceView): unknown
  complete(state: unknown): boolean
  /** Slices this hook's state exposes to other hooks. */
  publishSlices?(state: unknown): Record<string, unknown>
}
