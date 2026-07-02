import { describe, expect, it } from 'vitest'

import { createInstructions } from '../../src/ui/instructions'
import { createGameStore } from '../../src/state/root'

describe('instructions view', () => {
  it('lists every control and the numbered six-step rescue loop', () => {
    const store = createGameStore()
    store.dispatch({ type: 'instructionsOpened' })
    const view = createInstructions(store)
    const controls = view.element.querySelector('.instructions-controls')?.textContent ?? ''
    const steps = [...view.element.querySelectorAll('ol.rescue-loop > li')]

    expect(controls).toContain('A / D')
    expect(controls).toContain('W / S')
    expect(controls).toContain('E / Space')
    expect(controls).toContain('Q')
    expect(controls).toContain('Escape / P')
    expect(steps).toHaveLength(6)
    expect(steps.map((step) => step.textContent).join(' ')).toMatch(
      /distress.*radio.*bearing.*power.*aim.*rescue/i
    )

    view.element.querySelector<HTMLButtonElement>('.instructions-back')?.click()
    expect(store.getState().scene).toBe('title')
  })

  it('disposes idempotently and removes the back listener', () => {
    const store = createGameStore()
    store.dispatch({ type: 'instructionsOpened' })
    const view = createInstructions(store)
    const back = view.element.querySelector<HTMLButtonElement>('.instructions-back')!

    view.dispose()
    view.dispose()
    back.click()

    expect(store.getState().scene).toBe('instructions')
  })
})
