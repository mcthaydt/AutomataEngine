// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { createVirtualJoystick } from '../../src/input/joystick'

function makeBase(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  return el
}

const pointer = (el: HTMLElement, type: string, clientX: number, clientY: number) =>
  el.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }))

describe('createVirtualJoystick', () => {
  let base: HTMLElement
  beforeEach(() => { document.body.innerHTML = ''; base = makeBase() })

  it('reads zero before any touch', () => {
    const joystick = createVirtualJoystick(base, { radiusPx: 50 })
    expect(joystick.read()).toEqual({ x: 0, y: 0 })
    joystick.dispose()
  })

  it('maps drag offset to a vector (up = +y), scaled by radius', () => {
    const joystick = createVirtualJoystick(base, { radiusPx: 50, deadZone: 0 })
    pointer(base, 'pointerdown', 50, 50)
    pointer(base, 'pointermove', 75, 25)
    const v = joystick.read()
    expect(v.x).toBeCloseTo(0.5)
    expect(v.y).toBeCloseTo(0.5)
    joystick.dispose()
  })

  it('clamps to the radius', () => {
    const joystick = createVirtualJoystick(base, { radiusPx: 50, deadZone: 0 })
    pointer(base, 'pointerdown', 50, 50)
    pointer(base, 'pointermove', 250, 50)
    expect(joystick.read()).toEqual({ x: 1, y: -0 })
    joystick.dispose()
  })

  it('applies the dead zone', () => {
    const joystick = createVirtualJoystick(base, { radiusPx: 50, deadZone: 0.3 })
    pointer(base, 'pointerdown', 50, 50)
    pointer(base, 'pointermove', 55, 50)
    expect(joystick.read()).toEqual({ x: 0, y: 0 })
    joystick.dispose()
  })

  it('resets to zero on pointerup and positions the nub', () => {
    const joystick = createVirtualJoystick(base, { radiusPx: 50, deadZone: 0 })
    pointer(base, 'pointerdown', 50, 50)
    pointer(base, 'pointermove', 75, 50)
    expect(joystick.nub.style.transform).toBe('translate(25px, 0px)')
    pointer(base, 'pointerup', 75, 50)
    expect(joystick.read()).toEqual({ x: 0, y: 0 })
    expect(joystick.nub.style.transform).toBe('translate(0px, 0px)')
    joystick.dispose()
  })
})
