import { describe, expect, it } from 'vitest'
import {
  KEEPER_CLIMB_SPEED,
  KEEPER_MOVE_SPEED,
  moveKeeper
} from '../../src/sim/movement'
import { createInitialNight } from '../../src/state/night'

function keeper() {
  return createInitialNight(1, 42).keeper
}

describe('keeper movement', () => {
  it('moves horizontally at a fixed speed and faces the travel direction', () => {
    const right = moveKeeper(
      keeper(),
      { movement: { x: 1, y: 0 }, operate: false },
      0.5,
      { playing: true }
    )

    expect(right).toMatchObject({
      x: KEEPER_MOVE_SPEED * 0.5,
      y: 120,
      floor: 'quarters',
      facing: 1,
      mode: 'run'
    })

    const left = moveKeeper(
      right,
      { movement: { x: -1, y: 0 }, operate: false },
      0.25,
      { playing: true }
    )
    expect(left.x).toBeCloseTo(right.x - KEEPER_MOVE_SPEED * 0.25)
    expect(left.facing).toBe(-1)
  })

  it('clamps horizontal movement to the current floor and keeps the keeper on its platform', () => {
    const state = { ...keeper(), x: 79, y: 121 }
    const moved = moveKeeper(
      state,
      { movement: { x: 1, y: -0.2 }, operate: false },
      1,
      { playing: true }
    )

    expect(moved).toMatchObject({ x: 80, y: 120, floor: 'quarters' })
  })

  it('enters an adjacent ladder, climbs it, and exits on the connected floor', () => {
    const atLadder = { ...keeper(), x: 52 }
    const climbing = moveKeeper(
      atLadder,
      { movement: { x: 0, y: 1 }, operate: false },
      0.5,
      { playing: true }
    )

    expect(climbing).toMatchObject({
      floor: 'quarters',
      x: 52,
      y: 120 + KEEPER_CLIMB_SPEED * 0.5,
      mode: 'climb'
    })

    const exited = moveKeeper(
      climbing,
      { movement: { x: 0, y: 1 }, operate: false },
      1,
      { playing: true }
    )
    expect(exited).toMatchObject({ floor: 'navigation', x: 52, y: 168, mode: 'idle' })

    const descended = moveKeeper(
      exited,
      { movement: { x: 0, y: -1 }, operate: false },
      2,
      { playing: true }
    )
    expect(descended).toMatchObject({ floor: 'quarters', x: 52, y: 120, mode: 'idle' })
  })

  it('does not enter a ladder outside its horizontal tolerance', () => {
    const state = { ...keeper(), x: 40 }
    const moved = moveKeeper(
      state,
      { movement: { x: 0, y: 1 }, operate: false },
      1,
      { playing: true }
    )

    expect(moved).toMatchObject({ floor: 'quarters', x: 40, y: 120, mode: 'idle' })
  })

  it('clamps vertical travel to ladder endpoints even for a large step', () => {
    const moved = moveKeeper(
      { ...keeper(), x: 52 },
      { movement: { x: 0, y: 1 }, operate: false },
      10,
      { playing: true }
    )

    expect(moved).toMatchObject({ floor: 'navigation', x: 52, y: 168, mode: 'idle' })
  })

  it('produces equivalent movement for one step or many fixed steps', () => {
    const input = { movement: { x: 0.75, y: 0 }, operate: false }
    const single = moveKeeper(keeper(), input, 1, { playing: true })
    let fixed = keeper()
    for (let index = 0; index < 60; index++) {
      fixed = moveKeeper(fixed, input, 1 / 60, { playing: true })
    }

    expect(fixed.x).toBeCloseTo(single.x, 8)
    expect(fixed.y).toBe(single.y)
    expect(fixed.floor).toBe(single.floor)
  })

  it('does not move or change pose outside active play', () => {
    const state = keeper()
    expect(moveKeeper(
      state,
      { movement: { x: 1, y: 1 }, operate: true },
      1,
      { playing: false }
    )).toBe(state)
  })

  it('selects carry and operate poses when stationary', () => {
    const carrying = { ...keeper(), carriedItem: 'wrench' as const }
    expect(moveKeeper(
      carrying,
      { movement: { x: 0, y: 0 }, operate: false },
      1 / 60,
      { playing: true }
    ).mode).toBe('carry')
    expect(moveKeeper(
      carrying,
      { movement: { x: 0, y: 0 }, operate: true },
      1 / 60,
      { playing: true }
    ).mode).toBe('operate')
  })
})
