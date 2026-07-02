import { describe, expect, it } from 'vitest'

import { createGameStore, type GameStore } from '../../src/state/root'
import { createDefeat, createPauseOverlay, createVictory } from '../../src/ui/overlays'

function pausedStore(): GameStore {
  const store = createGameStore()
  store.dispatch({ type: 'runStarted', seed: 11 })
  store.dispatch({ type: 'paused' })
  return store
}

function endedStore(outcome: 'victory' | 'defeat'): GameStore {
  const store = createGameStore()
  store.dispatch({ type: 'runStarted', seed: 11 })
  const night = store.getState().night
  store.dispatch({
    type: 'nightAdvanced',
    night: {
      ...night,
      timeS: 780,
      rescues: 3,
      integrity: 80,
      outageS: 12.5,
      generator: { ...night.generator, damage: 0.2 },
      outcome,
      terminalReason: outcome === 'victory'
        ? 'Dawn reached with three ships safe'
        : 'Lighthouse flooded before dawn',
      score: 3950
    }
  })
  return store
}

describe('pause and terminal overlays', () => {
  it('pause exposes resume, restart, and title actions', () => {
    const store = pausedStore()
    let view = createPauseOverlay(store, () => 21)
    view.element.querySelector<HTMLButtonElement>('.pause-resume')!.click()
    expect(store.getState().scene).toBe('playing')
    view.dispose()

    store.dispatch({ type: 'paused' })
    view = createPauseOverlay(store, () => 22)
    view.element.querySelector<HTMLButtonElement>('.pause-restart')!.click()
    expect(store.getState().scene).toBe('playing')
    expect(store.getState().night.seed).toBe(22)
    view.dispose()

    store.dispatch({ type: 'paused' })
    view = createPauseOverlay(store, () => 23)
    view.element.querySelector<HTMLButtonElement>('.pause-title')!.click()
    expect(store.getState().scene).toBe('title')
    view.dispose()
  })

  it('victory shows the dawn reason and named score breakdown', () => {
    const store = endedStore('victory')
    const view = createVictory(store, () => 31)

    expect(view.element.querySelector('h1')?.textContent).toBe('DAWN')
    expect(view.element.querySelector('.result-reason')?.textContent).toContain('three ships safe')
    expect(view.element.querySelector('[data-line="rescues"]')?.textContent).toContain('3000')
    expect(view.element.querySelector('[data-line="integrity"]')?.textContent).toContain('800')
    expect(view.element.querySelector('[data-line="outage"]')?.textContent).toContain('-50')
    expect(view.element.querySelector('[data-line="efficiency"]')?.textContent).toContain('200')
    expect(view.element.querySelector('.result-total')?.textContent).toContain('3950')

    view.element.querySelector<HTMLButtonElement>('.result-retry')!.click()
    expect(store.getState().scene).toBe('playing')
    expect(store.getState().night.seed).toBe(31)
    view.dispose()
  })

  it('defeat shows the explicit cause and returns to title', () => {
    const store = endedStore('defeat')
    const view = createDefeat(store, () => 41)

    expect(view.element.querySelector('h1')?.textContent).toBe('LIGHT EXTINGUISHED')
    expect(view.element.querySelector('.result-reason')?.textContent).toContain('flooded before dawn')
    expect(view.element.querySelector('.result-total')?.textContent).toContain('3950')
    view.element.querySelector<HTMLButtonElement>('.result-title')!.click()
    expect(store.getState().scene).toBe('title')
    view.dispose()
  })

  it('removes every event listener on idempotent dispose', () => {
    const store = pausedStore()
    const pause = createPauseOverlay(store, () => 99)
    const buttons = [...pause.element.querySelectorAll<HTMLButtonElement>('button')]
    pause.dispose()
    pause.dispose()
    for (const button of buttons) button.click()
    expect(store.getState().scene).toBe('paused')

    const terminalStore = endedStore('victory')
    const terminal = createVictory(terminalStore, () => 100)
    const terminalButtons = [...terminal.element.querySelectorAll<HTMLButtonElement>('button')]
    terminal.dispose()
    terminal.dispose()
    for (const button of terminalButtons) button.click()
    expect(terminalStore.getState().scene).toBe('victory')
  })
})
