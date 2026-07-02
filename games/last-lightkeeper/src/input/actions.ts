import type { InputSource } from '@automata/engine'
import { createKeyboardInput } from '@automata/engine/browser'

export interface ActionInputSource {
  movement: InputSource
  read(): { operate: boolean }
  consume(): { carryPressed: boolean; interactPressed: boolean; pausePressed: boolean }
  dispose(): void
}

const OPERATE_CODES = new Set(['KeyE', 'Space'])
const PAUSE_CODES = new Set(['Escape', 'KeyP'])
const ACTION_CODES = new Set([...OPERATE_CODES, ...PAUSE_CODES, 'KeyQ'])

export function createActionInput(target: EventTarget): ActionInputSource {
  const movement = createKeyboardInput(target)
  const pressed = new Set<string>()
  let carryPressed = false
  let interactPressed = false
  let pausePressed = false
  let disposed = false

  const onDown = (event: Event): void => {
    const keyboard = event as KeyboardEvent
    if (keyboard.repeat || !ACTION_CODES.has(keyboard.code) || pressed.has(keyboard.code)) return
    pressed.add(keyboard.code)
    if (keyboard.code === 'KeyQ') carryPressed = true
    if (OPERATE_CODES.has(keyboard.code)) interactPressed = true
    if (PAUSE_CODES.has(keyboard.code)) pausePressed = true
  }
  const onUp = (event: Event): void => {
    pressed.delete((event as KeyboardEvent).code)
  }
  target.addEventListener('keydown', onDown)
  target.addEventListener('keyup', onUp)

  return {
    movement,
    read() {
      return { operate: [...OPERATE_CODES].some((code) => pressed.has(code)) }
    },
    consume() {
      const actions = { carryPressed, interactPressed, pausePressed }
      carryPressed = false
      interactPressed = false
      pausePressed = false
      return actions
    },
    dispose() {
      if (disposed) return
      disposed = true
      target.removeEventListener('keydown', onDown)
      target.removeEventListener('keyup', onUp)
      movement.dispose()
      pressed.clear()
      carryPressed = false
      interactPressed = false
      pausePressed = false
    }
  }
}
