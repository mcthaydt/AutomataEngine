import { describe, expect, it } from 'vitest'
import { createNullAudio, createNullRenderer, type InputVector, type InputSource } from '@automata/engine'
import { createGameplay } from '../../src/game/gameplay'
import { createRng } from '../../src/sim/rng'
import { createGameStore } from '../../src/state/root'
import { WAVES } from '../../src/config'

const stick = (v: InputVector = { x: 0, y: 0 }): InputSource => ({ read: () => v, dispose() {} })

function setup(opts: { seed?: number; input?: InputVector } = {}) {
  const store = createGameStore()
  const render = createNullRenderer()
  const audio = createNullAudio()
  const game = createGameplay({
    store, render: render.port, audio: audio.port,
    rng: createRng(opts.seed ?? 7), inputSources: [stick(opts.input)]
  })
  return { store, render, audio, game }
}

const wave1Total = WAVES[0]!.rammer + WAVES[0]!.shooter

describe('createGameplay', () => {
  it('builds a player and a fixed camera on construction', () => {
    const { render, game } = setup()
    expect(game.world.with('player').first).toBeTruthy()
    expect(render.calls.some((c) => c.op === 'setCamera')).toBe(true)
    game.dispose()
  })

  it('stays inert at the title screen', () => {
    const { game } = setup()
    for (let i = 0; i < 60; i++) game.fixedUpdate(1 / 60)
    expect([...game.world.with('enemy')]).toHaveLength(0)
    game.dispose()
  })

  it('spawns wave one once the run starts', () => {
    const { store, game } = setup()
    store.dispatch({ type: 'runStarted' })
    game.fixedUpdate(1 / 60)
    expect([...game.world.with('enemy')]).toHaveLength(wave1Total)
    game.dispose()
  })

  it('rebuilds a clean world on retry', () => {
    const { store, game } = setup()
    store.dispatch({ type: 'runStarted' })
    game.fixedUpdate(1 / 60)
    store.dispatch({ type: 'retried' })
    expect([...game.world.with('enemy')]).toHaveLength(0)
    expect(game.world.with('player').first).toBeTruthy()
    game.dispose()
  })

  it('renders interpolated poses without throwing', () => {
    const { store, render, game } = setup()
    store.dispatch({ type: 'runStarted' })
    game.fixedUpdate(1 / 60)
    const before = render.calls.length
    game.render(0.5, 1 / 60)
    expect(render.calls.slice(before).some((c) => c.op === 'setPose')).toBe(true)
    game.dispose()
  })

  it('tears down all render objects on dispose', () => {
    const { render, store, game } = setup()
    store.dispatch({ type: 'runStarted' })
    game.fixedUpdate(1 / 60)
    game.dispose()
    expect(render.port.objectCount).toBe(0)
  })

  it('defaults to silent audio when none is provided', () => {
    const store = createGameStore()
    const render = createNullRenderer()
    const game = createGameplay({
      store, render: render.port, rng: createRng(1), inputSources: [stick()]
    })
    store.dispatch({ type: 'runStarted' })
    expect(() => { for (let i = 0; i < 30; i++) game.fixedUpdate(1 / 60) }).not.toThrow()
    game.dispose()
  })

  it('pins the rendered pose while frozen at the title', () => {
    const { render, game } = setup()
    const player = game.world.with('player', 'transform').first!
    player.transform.prevPosition = { x: 0, y: 0.5, z: 0 }
    player.transform.position = { x: 4, y: 0.5, z: 0 }
    const poseAt = (alpha: number) => {
      const start = render.calls.length
      game.render(alpha)
      return render.calls.slice(start).find((c) => c.op === 'setPose' && c.entity === player)!.position!
    }
    expect(poseAt(0).x).toBeCloseTo(poseAt(1).x)
    game.dispose()
  })

  it('is deterministic for a given seed', () => {
    const a = setup({ seed: 123 })
    const b = setup({ seed: 123 })
    a.store.dispatch({ type: 'runStarted' })
    b.store.dispatch({ type: 'runStarted' })
    for (let i = 0; i < 30; i++) { a.game.fixedUpdate(1 / 60); b.game.fixedUpdate(1 / 60) }
    const posA = [...a.game.world.with('enemy', 'transform')].map((e) => e.transform.position)
    const posB = [...b.game.world.with('enemy', 'transform')].map((e) => e.transform.position)
    expect(posA).toEqual(posB)
    a.game.dispose(); b.game.dispose()
  })
})
