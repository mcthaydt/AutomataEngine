export interface LoopHooks {
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt: number): void
}

export interface LoopOptions {
  fixedDt?: number
  maxSubSteps?: number
}

export class GameLoop {
  private readonly fixedDt: number
  private readonly maxSubSteps: number
  private lastMs: number | null = null
  private accumulator = 0

  constructor(private hooks: LoopHooks, options: LoopOptions = {}) {
    this.fixedDt = options.fixedDt ?? 1 / 60
    this.maxSubSteps = options.maxSubSteps ?? 5
  }

  tick(nowMs: number): void {
    let frameDt = 0
    if (this.lastMs !== null) {
      const rawElapsed = (nowMs - this.lastMs) / 1000
      frameDt = Math.min(Math.max(0, rawElapsed), this.fixedDt * this.maxSubSteps)
      this.accumulator = Math.min(
        this.accumulator + frameDt,
        this.fixedDt * this.maxSubSteps
      )
      while (this.accumulator >= this.fixedDt - 1e-9) {
        this.hooks.fixedUpdate(this.fixedDt)
        this.accumulator = Math.max(0, this.accumulator - this.fixedDt)
      }
    }
    this.lastMs = nowMs
    this.hooks.render(this.accumulator / this.fixedDt, frameDt)
  }
}
