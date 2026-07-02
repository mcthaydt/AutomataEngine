import { describe, expect, it } from 'vitest'

import { createActionInput } from '../../src/input/actions'

function key(target: EventTarget, type: 'keydown' | 'keyup', code: string, repeat = false): void {
  target.dispatchEvent(new KeyboardEvent(type, { code, repeat }))
}

describe('keeper action input', () => {
  it('holds E or Space for interaction and clears only after release', () => {
    const target = new EventTarget()
    const input = createActionInput(target)
    key(target, 'keydown', 'KeyE')
    expect(input.read()).toEqual({ operate: true })
    expect(input.consume()).toEqual({
      carryPressed: false,
      interactPressed: true,
      pausePressed: false
    })
    expect(input.consume().interactPressed).toBe(false)
    key(target, 'keydown', 'Space')
    key(target, 'keyup', 'KeyE')
    expect(input.read()).toEqual({ operate: true })
    key(target, 'keyup', 'Space')
    expect(input.read()).toEqual({ operate: false })
    input.dispose()
  })

  it('consumes Q carry/drop once and suppresses repeat events', () => {
    const target = new EventTarget()
    const input = createActionInput(target)
    key(target, 'keydown', 'KeyQ')
    key(target, 'keydown', 'KeyQ', true)

    expect(input.consume()).toEqual({
      carryPressed: true,
      interactPressed: false,
      pausePressed: false
    })
    expect(input.consume()).toEqual({
      carryPressed: false,
      interactPressed: false,
      pausePressed: false
    })
    key(target, 'keyup', 'KeyQ')
    key(target, 'keydown', 'KeyQ')
    expect(input.consume().carryPressed).toBe(true)
    input.dispose()
  })

  it('maps Escape and P to edge-triggered pause', () => {
    const target = new EventTarget()
    const input = createActionInput(target)
    key(target, 'keydown', 'Escape')
    expect(input.consume().pausePressed).toBe(true)
    expect(input.consume().pausePressed).toBe(false)
    key(target, 'keydown', 'KeyP')
    expect(input.consume().pausePressed).toBe(true)
    input.dispose()
  })

  it('delegates movement to the engine keyboard InputSource', () => {
    const target = new EventTarget()
    const input = createActionInput(target)
    key(target, 'keydown', 'KeyD')
    key(target, 'keydown', 'ArrowUp')
    expect(input.movement.read().x).toBeCloseTo(Math.SQRT1_2)
    expect(input.movement.read().y).toBeCloseTo(Math.SQRT1_2)
    key(target, 'keyup', 'KeyD')
    key(target, 'keyup', 'ArrowUp')
    expect(input.movement.read()).toEqual({ x: 0, y: 0 })
    input.dispose()
  })

  it('clears state and removes all listeners on idempotent dispose', () => {
    const target = new EventTarget()
    const input = createActionInput(target)
    key(target, 'keydown', 'KeyE')
    key(target, 'keydown', 'KeyQ')
    key(target, 'keydown', 'KeyA')
    input.dispose()
    input.dispose()

    expect(input.read()).toEqual({ operate: false })
    expect(input.consume()).toEqual({
      carryPressed: false,
      interactPressed: false,
      pausePressed: false
    })
    expect(input.movement.read()).toEqual({ x: 0, y: 0 })
    key(target, 'keydown', 'KeyE')
    key(target, 'keydown', 'KeyD')
    expect(input.read()).toEqual({ operate: false })
    expect(input.movement.read()).toEqual({ x: 0, y: 0 })
  })
})
