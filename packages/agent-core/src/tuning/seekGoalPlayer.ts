import type { PlayObservation } from '@automata/contracts'

export interface SeekGoalOptions {
  /** Stop steering within this XZ distance of the goal. Default 0.5. */
  arriveRadius?: number
}

export function createSeekGoalPlayer(
  opts: SeekGoalOptions = {}
): (step: number, observation: PlayObservation) => { x: number; y: number } {
  const arrive = opts.arriveRadius ?? 0.5
  return (_step, observation) => {
    const dx = observation.goal.x - observation.ball.position.x
    const dz = observation.goal.z - observation.ball.position.z
    const dist = Math.hypot(dx, dz)
    if (dist <= arrive) return { x: 0, y: 0 }
    return { x: dx / dist, y: -dz / dist }
  }
}
