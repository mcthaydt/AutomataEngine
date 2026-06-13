export const FIXED_STAGES = ['input', 'update', 'physics', 'postPhysics'] as const
export const ALL_STAGES = [...FIXED_STAGES, 'render'] as const
export type Stage = (typeof ALL_STAGES)[number]

export interface System<Ctx> {
  name: string
  stage: Stage
  run(ctx: Ctx): void
}

export class Scheduler<Ctx> {
  private stages = new Map<Stage, System<Ctx>[]>(ALL_STAGES.map((stage) => [stage, []]))
  private names = new Set<string>()
  private fixedEndHooks: Array<(ctx: Ctx) => void> = []

  add(system: System<Ctx>): void {
    if (this.names.has(system.name)) {
      throw new Error(`Duplicate system name "${system.name}"`)
    }
    this.names.add(system.name)
    this.stages.get(system.stage)!.push(system)
  }

  /**
   * Registers a callback run once at the end of each fixed update, after every
   * fixed stage. Order-independent of system registration — the natural home
   * for per-step teardown like draining a frame-scoped EventQueue.
   */
  onFixedEnd(hook: (ctx: Ctx) => void): void {
    this.fixedEndHooks.push(hook)
  }

  runStage(stage: Stage, ctx: Ctx): void {
    for (const system of this.stages.get(stage)!) system.run(ctx)
  }

  /** Runs all non-render stages in order, call once per fixed update. */
  runFixed(ctx: Ctx): void {
    for (const stage of FIXED_STAGES) this.runStage(stage, ctx)
    for (const hook of this.fixedEndHooks) hook(ctx)
  }
}
