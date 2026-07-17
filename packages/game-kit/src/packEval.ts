/**
 * Headless twin of the pack runtime: a pure hook the scripted evaluator drives
 * to complete a pack's objectives deterministically (no DOM, no engine).
 */
export interface PackEvalHook {
  packId: string
  createState(): unknown
  /** Next waypoint the scripted evaluator should seek, or null when satisfied. */
  nextTarget(state: unknown, player: { x: number; z: number }): { x: number; z: number } | null
  step(state: unknown, player: { x: number; z: number }): unknown
  complete(state: unknown): boolean
}
