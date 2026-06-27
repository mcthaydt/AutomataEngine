export interface TuningLoopOptions<State> {
  /** Starting state; also the baseline score the first proposal must beat. */
  initial: State
  /** Propose an edited state from the current best. */
  propose: (best: State, bestScore: number, iteration: number) => Promise<State>
  /** Fitness of a state; higher is better. */
  score: (state: State) => Promise<number>
  /** Hard floor: proposals that fail validation are reverted before scoring. */
  validate: (state: State) => boolean
  /** Stop once bestScore >= target. */
  target?: number
  /** Max proposal iterations. Default 10. */
  maxIterations?: number
  /** Stop after this many consecutive non-improving or invalid iterations. Default 3. */
  patience?: number
}

export interface TuningResult<State> {
  best: State
  bestScore: number
  /** Number of proposal iterations attempted. */
  iterations: number
  /** Number of proposals kept because they beat the best score. */
  accepted: number
}

export async function runTuningLoop<State>(opts: TuningLoopOptions<State>): Promise<TuningResult<State>> {
  const maxIterations = opts.maxIterations ?? 10
  const patience = opts.patience ?? 3

  let best = opts.initial
  let bestScore = await opts.score(best)
  let accepted = 0
  let stale = 0
  let iterations = 0

  while (iterations < maxIterations) {
    if (opts.target !== undefined && bestScore >= opts.target) break
    iterations += 1

    const candidate = await opts.propose(best, bestScore, iterations - 1)
    if (!opts.validate(candidate)) {
      if (++stale >= patience) break
      continue
    }

    const candidateScore = await opts.score(candidate)
    if (candidateScore > bestScore) {
      best = candidate
      bestScore = candidateScore
      accepted += 1
      stale = 0
    } else if (++stale >= patience) {
      break
    }
  }

  return { best, bestScore, iterations, accepted }
}
