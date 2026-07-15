import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createGameplay } from '../../src/game/gameplay'
import { compileProject } from '../../src/project/compiler'
import { createTemplate } from '../../src/project/template'
import { seekGoal } from '../../src/sim/sim'

describe('gameplay', () => {
  const compiled = compileProject(createTemplate())

  it('adds floor, goal, and player renderables with authored colors, and removes them on dispose', () => {
    const render = createNullRenderer()
    const game = createGameplay({ compiled, render: render.port, control: () => ({ x: 0, z: 0 }) })
    const adds = render.calls.filter((call) => call.op === 'add')
    expect(adds.map((call) => call.def?.primitive)).toEqual(['box', 'cylinder', 'sphere'])
    expect(adds[0]?.def?.color).toBe(compiled.colors.floor)
    expect(render.calls.some((call) => call.op === 'setCamera')).toBe(true)
    game.dispose()
    expect(render.port.objectCount).toBe(0)
  })

  it('advances the sim each fixed step and poses the player on render', () => {
    const render = createNullRenderer()
    const game = createGameplay({
      compiled,
      render: render.port,
      control: (state) => seekGoal(state, compiled.tuning)
    })
    const before = game.state
    game.fixedUpdate(1 / 60)
    expect(game.state.position).not.toEqual(before.position)

    render.calls.length = 0
    game.render(0)
    const pose = render.calls.find((call) => call.op === 'setPose')
    expect(pose?.position).toMatchObject({ x: game.state.position.x, z: game.state.position.z })
    game.dispose()
  })

  it('holds success while the objective gate is closed and releases when it opens', () => {
    const render = createNullRenderer()
    let gateOpen = false
    const game = createGameplay({
      compiled,
      render: render.port,
      control: (state) => seekGoal(state, compiled.tuning),
      objectiveGate: () => gateOpen
    })
    for (let index = 0; index < 600 && game.state.status === 'running'; index += 1) game.fixedUpdate(1 / 60)
    expect(game.state.status).toBe('running')
    gateOpen = true
    for (let index = 0; index < 600 && game.state.status === 'running'; index += 1) game.fixedUpdate(1 / 60)
    expect(game.state.status).toBe('succeeded')
    game.dispose()
  })
})
