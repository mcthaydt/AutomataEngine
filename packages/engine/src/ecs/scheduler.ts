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

  add(system: System<Ctx>): void {
    if (this.names.has(system.name)) {
      throw new Error(`Duplicate system name "${system.name}"`)
    }
    this.names.add(system.name)
    this.stages.get(system.stage)!.push(system)
  }

  runStage(stage: Stage, ctx: Ctx): void {
    for (const system of this.stages.get(stage)!) system.run(ctx)
  }

  /** Runs all non-render stages in order, call once per fixed update. */
  runFixed(ctx: Ctx): void {
    for (const stage of FIXED_STAGES) this.runStage(stage, ctx)
  }
}
