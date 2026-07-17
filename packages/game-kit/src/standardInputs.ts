import type { CleanupStack, InputSource } from '@automata/engine'
import { createKeyboardInput, createVirtualJoystick } from '@automata/engine/browser'

export interface StandardInputs {
  inputs: InputSource[]
  element: HTMLElement
}

/** Mounts keyboard and touch controls; disposal belongs to the caller's lifecycle. */
export function createStandardInputs(
  app: HTMLElement,
  cleanup: CleanupStack,
  opts: { joystickClass?: string } = {}
): StandardInputs {
  const element = document.createElement('div')
  element.className = opts.joystickClass ?? 'joystick'
  app.append(element)
  cleanup.defer(() => element.remove())
  const inputs: InputSource[] = [createKeyboardInput(window), createVirtualJoystick(element)]
  for (const input of inputs) cleanup.defer(() => input.dispose())
  return { inputs, element }
}
