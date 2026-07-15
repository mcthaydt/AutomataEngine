import type { Quat, RenderPort, Vec3 } from '@automata/engine'
import type { CompiledProject } from '../project/types'
import { createInitialState, step, type SimControl, type SimState } from '../sim/sim'

export interface GameplayDeps {
  compiled: CompiledProject
  render: RenderPort
  /** Sampled once per fixed step. */
  control(state: SimState): SimControl
  /** Optional win gate (from composed packs); goal completion holds until it opens. */
  objectiveGate?: () => boolean
}

export interface Gameplay {
  readonly state: SimState
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt?: number): void
  dispose(): void
}

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 }

/** Wire the pure sim to the engine render port; shared by browser boot and editor preview. */
export function createGameplay(deps: GameplayDeps): Gameplay {
  const { compiled, render } = deps
  const { tuning, colors } = compiled
  let state = createInitialState(compiled.spawn)

  const floor = { id: 'floor' }
  const goal = { id: 'goal' }
  const player = { id: 'player' }
  const playerPose = (): Vec3 => ({ x: state.position.x, y: 0.5, z: state.position.z })

  render.add(floor, {
    primitive: 'box',
    size: { x: tuning.arenaHalf * 2, y: 0.3, z: tuning.arenaHalf * 2 },
    color: colors.floor
  })
  render.setPose(floor, { x: 0, y: -0.15, z: 0 }, IDENTITY)
  render.add(goal, { primitive: 'cylinder', radius: tuning.goalRadius, height: 0.2, color: colors.goal })
  render.setPose(goal, { x: tuning.goal.x, y: 0.1, z: tuning.goal.z }, IDENTITY)
  render.add(player, { primitive: 'sphere', radius: 0.5, color: colors.player })
  render.setPose(player, playerPose(), IDENTITY)
  render.setCamera({ x: 0, y: tuning.arenaHalf * 1.5, z: tuning.arenaHalf * 1.9 }, { x: 0, y: 0, z: 0 })

  return {
    get state() { return state },
    fixedUpdate(dt) {
      let next = step(state, deps.control(state), dt, tuning)
      if (next.status === 'succeeded' && deps.objectiveGate && !deps.objectiveGate()) {
        next = { ...next, status: 'running' }
      }
      state = next
    },
    render() {
      render.setPose(player, playerPose(), IDENTITY)
    },
    dispose() {
      render.remove(floor)
      render.remove(goal)
      render.remove(player)
    }
  }
}
