import type { InputSource, InputVector } from './types'
import { clampToUnit } from './vector'

export interface JoystickOptions {
  radiusPx?: number
  deadZone?: number
}

export interface VirtualJoystick extends InputSource {
  nub: HTMLElement
}

export function createVirtualJoystick(
  base: HTMLElement,
  options: JoystickOptions = {}
): VirtualJoystick {
  const radius = options.radiusPx ?? 50
  const deadZone = options.deadZone ?? 0.15

  const nub = document.createElement('div')
  nub.className = 'joystick-nub'
  nub.style.transform = 'translate(0px, 0px)'
  base.appendChild(nub)

  let active = false
  let value: InputVector = { x: 0, y: 0 }

  const center = (): { x: number; y: number } => {
    const rect = base.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const update = (clientX: number, clientY: number): void => {
    const c = center()
    const { x: dx, y: dy } = clampToUnit((clientX - c.x) / radius, (clientY - c.y) / radius)
    nub.style.transform = `translate(${dx * radius}px, ${dy * radius}px)`
    value = Math.hypot(dx, dy) < deadZone ? { x: 0, y: 0 } : { x: dx, y: -dy }
  }

  const reset = (): void => {
    active = false
    value = { x: 0, y: 0 }
    nub.style.transform = 'translate(0px, 0px)'
  }

  const onDown = (event: Event): void => {
    active = true
    const e = event as PointerEvent
    base.setPointerCapture(e.pointerId)
    update(e.clientX, e.clientY)
  }
  const onMove = (event: Event): void => {
    if (!active) return
    const e = event as PointerEvent
    update(e.clientX, e.clientY)
  }
  const onUp = (): void => reset()

  base.addEventListener('pointerdown', onDown)
  base.addEventListener('pointermove', onMove)
  base.addEventListener('pointerup', onUp)
  base.addEventListener('pointercancel', onUp)

  return {
    nub,
    read: () => value,
    dispose() {
      base.removeEventListener('pointerdown', onDown)
      base.removeEventListener('pointermove', onMove)
      base.removeEventListener('pointerup', onUp)
      base.removeEventListener('pointercancel', onUp)
      nub.remove()
    }
  }
}
