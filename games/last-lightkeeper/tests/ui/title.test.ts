import { describe, expect, it } from 'vitest'
import { memoryStorage } from '@automata/engine'

import { createTitle } from '../../src/ui/title'
import { PROGRESS_KEY } from '../../src/state/progress'
import { createGameStore } from '../../src/state/root'

describe('title view', () => {
  it('shows the premise, persisted best score, and both routes', () => {
    const storage = memoryStorage()
    storage.set(PROGRESS_KEY, JSON.stringify({
      version: 1,
      data: { bestScore: 4321, bestRescues: 4, completedRuns: 2 }
    }))
    const store = createGameStore({ storage })
    const view = createTitle(store, () => 37)

    expect(view.element.querySelector('h1')?.textContent).toBe('LAST LIGHTKEEPER')
    expect(view.element.querySelector('.title-premise')?.textContent).toMatch(/lighthouse|storm/i)
    expect(view.element.querySelector('.title-best')?.textContent).toContain('4321')
    expect(view.element.querySelector('.title-start')?.textContent).toMatch(/start/i)
    expect(view.element.querySelector('.title-instructions')?.textContent).toMatch(/instructions/i)

    view.element.querySelector<HTMLButtonElement>('.title-instructions')?.click()
    expect(store.getState().scene).toBe('instructions')
    store.dispatch({ type: 'quitToTitle' })
    view.element.querySelector<HTMLButtonElement>('.title-start')?.click()
    expect(store.getState().scene).toBe('playing')
    expect(store.getState().night.seed).toBe(37)
  })

  it('disposes idempotently and removes button listeners', () => {
    const store = createGameStore()
    const view = createTitle(store, () => 9)
    const start = view.element.querySelector<HTMLButtonElement>('.title-start')!
    document.body.append(view.element)

    view.dispose()
    view.dispose()
    start.click()

    expect(store.getState().scene).toBe('title')
    expect(view.element.isConnected).toBe(false)
  })
})
