import { describe, expect, it } from 'vitest'
import { createCleanupStack } from '@automata/engine'
import { createStandardInputs } from '../src/standardInputs'

describe('createStandardInputs', () => {
  it('mounts a joystick and returns keyboard + joystick inputs', () => {
    const app = document.createElement('div')
    const { inputs, element } = createStandardInputs(app, createCleanupStack(), { joystickClass: 'joystick left' })
    expect(inputs).toHaveLength(2)
    expect(element.className).toBe('joystick left')
    expect(app.contains(element)).toBe(true)
  })

  it('removes the joystick when its cleanup stack disposes', () => {
    const app = document.createElement('div')
    const cleanup = createCleanupStack()
    const { element } = createStandardInputs(app, cleanup)
    cleanup.dispose()
    expect(app.contains(element)).toBe(false)
  })
})
