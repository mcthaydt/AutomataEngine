import type { InputSource, InputVector } from './types'

const AXES: Record<string, InputVector> = {
  KeyW: { x: 0, y: 1 }, ArrowUp: { x: 0, y: 1 },
  KeyS: { x: 0, y: -1 }, ArrowDown: { x: 0, y: -1 },
  KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 }
}

export function createKeyboardInput(target: EventTarget): InputSource {
  const pressed = new Set<string>()
  const onDown = (event: Event): void => {
    const code = (event as KeyboardEvent).code
    if (code in AXES) pressed.add(code)
  }
  const onUp = (event: Event): void => {
    pressed.delete((event as KeyboardEvent).code)
  }
  target.addEventListener('keydown', onDown)
  target.addEventListener('keyup', onUp)

  return {
    read() {
      let x = 0, y = 0
      for (const code of pressed) {
        const axis = AXES[code]!
        x += axis.x
        y += axis.y
      }
      const len = Math.hypot(x, y)
      return len > 1 ? { x: x / len, y: y / len } : { x, y }
    },
    dispose() {
      target.removeEventListener('keydown', onDown)
      target.removeEventListener('keyup', onUp)
      pressed.clear()
    }
  }
}
