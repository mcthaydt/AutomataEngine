import { describe, expect, it, vi } from 'vitest'
import { GameLoop } from '../../src/loop/gameLoop'

describe('GameLoop', () => {
  it('first tick establishes the baseline without fixed updates', () => {
    const fixedUpdate = vi.fn(), render = vi.fn()
    const loop = new GameLoop({ fixedUpdate, render })
    loop.tick(1000)
    expect(fixedUpdate).not.toHaveBeenCalled()
    expect(render).toHaveBeenCalledWith(0)
  })

  it('runs fixedUpdate once per fixedDt of elapsed time', () => {
    const fixedUpdate = vi.fn(), render = vi.fn()
    const loop = new GameLoop({ fixedUpdate, render }, { fixedDt: 1 / 60 })
    loop.tick(1000)
    loop.tick(1000 + (1000 / 60) * 3)
    expect(fixedUpdate).toHaveBeenCalledTimes(3)
    expect(fixedUpdate).toHaveBeenCalledWith(1 / 60)
  })

  it('passes the interpolation alpha (accumulator remainder) to render', () => {
    const fixedUpdate = vi.fn(), render = vi.fn()
    const loop = new GameLoop({ fixedUpdate, render }, { fixedDt: 0.01 })
    loop.tick(0)
    loop.tick(15)
    expect(fixedUpdate).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenLastCalledWith(expect.closeTo(0.5))
  })

  it('clamps huge frame gaps to maxSubSteps (no spiral of death)', () => {
    const fixedUpdate = vi.fn(), render = vi.fn()
    const loop = new GameLoop({ fixedUpdate, render }, { fixedDt: 0.01, maxSubSteps: 5 })
    loop.tick(0)
    loop.tick(10_000)
    expect(fixedUpdate).toHaveBeenCalledTimes(5)
  })

  it('accumulates fractional steps across ticks', () => {
    const fixedUpdate = vi.fn(), render = vi.fn()
    const loop = new GameLoop({ fixedUpdate, render }, { fixedDt: 0.01 })
    loop.tick(0)
    loop.tick(6)
    expect(fixedUpdate).toHaveBeenCalledTimes(0)
    loop.tick(12)
    expect(fixedUpdate).toHaveBeenCalledTimes(1)
  })
})
