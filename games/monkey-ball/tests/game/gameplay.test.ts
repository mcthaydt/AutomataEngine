// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  archetypeLibraryKind, createNullRenderer, createRapierPhysics, parseData, type InputSource
} from '@automata/engine'
import { stick } from '@automata/game-kit/testing'
import { createGameplay } from '../../src/game/gameplay'
import { levelKind } from '../../src/data/level'
import { createGameStore } from '../../src/state/root'
import { readDataFile } from '../helpers/data'
import { physicsTuningKind, toPhysicsTuning, type PhysicsTuning } from '../../src/data/config'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const level = parseData(levelKind, readDataFile('levels/w1-l1.json'), 'w1-l1.json')
const tuning: PhysicsTuning = {
  maxTiltRad: (12 * Math.PI) / 180, tiltSmooth: 1, gravity: 9.81, ball: { radius: 0.5, friction: 0.6 }
}
const shippedTuning = toPhysicsTuning(
  parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml')
)
async function startGame(input: InputSource) {
  const physics = await createRapierPhysics()
  const render = createNullRenderer()
  const store = createGameStore()
  store.dispatch({ type: 'levelStarted', levelId: level.id })
  const game = createGameplay({
    store, physics, render: render.port, lib, level, tuning, inputSources: [input]
  })
  return { physics, render, store, game }
}

describe('gameplay runner (real physics)', () => {
  it('rolls the ball toward a held tilt', async () => {
    const { physics, game } = await startGame(stick({ x: 1, y: 0 }))
    const ball = game.world.with('ball', 'transform').first!
    const startX = physics.readPose(ball)!.position.x
    for (let i = 0; i < 120; i++) game.fixedUpdate(1 / 60)
    expect(physics.readPose(ball)!.position.x).toBeGreaterThan(startX + 1)
    game.dispose(); physics.dispose()
  })

  it('rolls visibly with the shipped physics tuning', async () => {
    const physics = await createRapierPhysics()
    const render = createNullRenderer()
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: level.id })
    const game = createGameplay({
      store, physics, render: render.port, lib, level, tuning: shippedTuning,
      inputSources: [stick({ x: 1, y: 0 })]
    })
    const ball = game.world.with('ball', 'transform').first!
    const startX = physics.readPose(ball)!.position.x
    for (let i = 0; i < 120; i++) game.fixedUpdate(1 / 60)
    expect(physics.readPose(ball)!.position.x).toBeGreaterThan(startX + 0.2)
    game.dispose(); physics.dispose()
  })

  it('rebuilds the world on respawn and tears down cleanly', async () => {
    const { physics, render, store, game } = await startGame(stick({ x: 0, y: 0 }))
    const bodies = physics.bodyCount
    expect(bodies).toBeGreaterThan(0)

    store.dispatch({ type: 'ballFell' })
    expect(physics.bodyCount).toBe(bodies)
    const ball = game.world.with('ball', 'transform').first!
    expect(ball.transform.position).toEqual({ x: 0, y: 1, z: 6 })
    expect([...game.world.with('ball')]).toHaveLength(1)
    expect([...game.world.with('collectible')]).toHaveLength(2)

    game.dispose()
    expect(physics.bodyCount).toBe(0)
    expect(render.port.objectCount).toBe(0)
  })

  it('freezes the simulation when the scene is not playing', async () => {
    const { physics, store, game } = await startGame(stick({ x: 1, y: 0 }))
    const ball = game.world.with('ball', 'transform').first!
    store.dispatch({ type: 'levelCompleted', levelId: level.id, timeMs: 1000, bananas: 0 })
    const frozen = physics.readPose(ball)!.position.x
    for (let i = 0; i < 60; i++) game.fixedUpdate(1 / 60)
    expect(physics.readPose(ball)!.position.x).toBeCloseTo(frozen)
    game.dispose(); physics.dispose()
  })

  it('renders a settled pose without interpolation jitter once frozen', async () => {
    const { physics, render, store, game } = await startGame(stick({ x: 1, y: 0 }))
    const ball = game.world.with('ball', 'transform').first!
    // Roll so the ball carries velocity into the freeze: prevPosition != position.
    for (let i = 0; i < 60; i++) game.fixedUpdate(1 / 60)
    store.dispatch({ type: 'levelCompleted', levelId: level.id, timeMs: 1000, bananas: 0 })
    expect(ball.transform.prevPosition.x).not.toBeCloseTo(ball.transform.position.x)

    const ballPoseAt = (alpha: number) => {
      const start = render.calls.length
      game.render(alpha)
      return render.calls
        .slice(start)
        .find((c) => c.op === 'setPose' && c.entity === ball)!.position!
    }
    // The render loop keeps sweeping alpha after the sim stops; rendered pose must not move.
    const a0 = ballPoseAt(0)
    const a1 = ballPoseAt(1)
    expect(a0.x).toBeCloseTo(a1.x)
    expect(a0.z).toBeCloseTo(a1.z)
    game.dispose(); physics.dispose()
  })
})
