// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createKeyboardInput } from '../../src/input/keyboard'

const press = (code: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code }))
const release = (code: string) =>
  window.dispatchEvent(new KeyboardEvent('keyup', { code }))

describe('createKeyboardInput', () => {
  it('reads zero with nothing pressed', () => {
    const input = createKeyboardInput(window)
    expect(input.read()).toEqual({ x: 0, y: 0 })
    input.dispose()
  })

  it('maps WASD and arrows to axes (y forward = W/Up)', () => {
    const input = createKeyboardInput(window)
    press('KeyW')
    expect(input.read()).toEqual({ x: 0, y: 1 })
    release('KeyW')
    press('ArrowDown'); press('KeyD')
    const v = input.read()
    expect(v.x).toBeCloseTo(Math.SQRT1_2)
    expect(v.y).toBeCloseTo(-Math.SQRT1_2)
    input.dispose()
  })

  it('opposing keys cancel out', () => {
    const input = createKeyboardInput(window)
    press('KeyA'); press('KeyD')
    expect(input.read()).toEqual({ x: 0, y: 0 })
    input.dispose()
  })

  it('dispose removes listeners', () => {
    const input = createKeyboardInput(window)
    input.dispose()
    press('KeyW')
    expect(input.read()).toEqual({ x: 0, y: 0 })
  })

  it('ignores unrelated keys', () => {
    const input = createKeyboardInput(window)
    press('Space')
    expect(input.read()).toEqual({ x: 0, y: 0 })
    input.dispose()
  })
})
