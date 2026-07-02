import { describe, expect, it } from 'vitest'

import { createGameStore } from '../../src/state/root'
import { createHud } from '../../src/ui/hud'

function startedStore() {
  const store = createGameStore({ seed: 7 })
  store.dispatch({ type: 'runStarted', seed: 7 })
  return store
}

const text = (element: HTMLElement, selector: string): string =>
  element.querySelector(selector)?.textContent ?? ''

describe('keeper HUD', () => {
  it('shows every operational signal with text and state classes', () => {
    const store = startedStore()
    const initial = store.getState().night
    store.dispatch({
      type: 'nightAdvanced',
      night: {
        ...initial,
        timeS: 125,
        rescues: 2,
        integrity: 64,
        flooding: 38,
        generator: { heat: 0.72, damage: 0.1, capacity: 2 },
        beaconBearingDeg: -28,
        beaconLockS: 3.5,
        activeCallId: 'mercy-bell',
        calls: {
          ...initial.calls,
          'mercy-bell': { ...initial.calls['mercy-bell']!, status: 'guiding', lockS: 3.5 }
        },
        keeper: { ...initial.keeper, carriedItem: 'wrench' },
        focus: { kind: 'station', id: 'beacon', prompt: 'E Hold beacon controls', distance: 4 },
        circuits: {
          ...initial.circuits,
          beacon: { requested: true, powered: true, tripped: false },
          radio: { requested: true, powered: false, tripped: false },
          bilge: { requested: true, powered: false, tripped: true }
        }
      }
    })

    const hud = createHud(store)
    expect(text(hud.element, '.hud-time')).toContain('10:55')
    expect(text(hud.element, '.hud-rescues')).toContain('2/3')
    expect(text(hud.element, '.hud-integrity')).toContain('64%')
    expect(text(hud.element, '.hud-flood')).toContain('38%')
    expect(text(hud.element, '.hud-generator')).toMatch(/72%.*2/i)
    expect(text(hud.element, '.hud-beacon')).toMatch(/-28.*3\.5/i)
    expect(text(hud.element, '.hud-call')).toMatch(/Mercy Bell.*guiding/i)
    expect(text(hud.element, '.hud-carried')).toMatch(/wrench/i)
    expect(text(hud.element, '.hud-prompt')).toContain('E Hold beacon controls')

    const beacon = hud.element.querySelector('.hud-circuit[data-circuit="beacon"]')!
    const radio = hud.element.querySelector('.hud-circuit[data-circuit="radio"]')!
    const bilge = hud.element.querySelector('.hud-circuit[data-circuit="bilge"]')!
    expect(beacon.classList).toContain('is-requested')
    expect(beacon.classList).toContain('is-powered')
    expect(beacon.textContent).toMatch(/requested.*powered/i)
    expect(radio.classList).toContain('is-requested')
    expect(radio.classList).toContain('is-unpowered')
    expect(radio.textContent).toMatch(/requested.*unpowered/i)
    expect(bilge.classList).toContain('is-tripped')
    expect(bilge.textContent).toMatch(/tripped/i)
  })

  it('updates existing nodes once and unsubscribes on idempotent dispose', () => {
    const store = startedStore()
    const hud = createHud(store)
    const initialNodeCount = hud.element.querySelectorAll('*').length
    const initial = store.getState().night

    store.dispatch({
      type: 'nightAdvanced',
      night: { ...initial, timeS: 60, flooding: 25, focus: null }
    })
    store.dispatch({
      type: 'nightAdvanced',
      night: { ...store.getState().night, timeS: 120, flooding: 50 }
    })

    expect(hud.element.querySelectorAll('*')).toHaveLength(initialNodeCount)
    expect(text(hud.element, '.hud-time')).toContain('11:00')
    expect(text(hud.element, '.hud-flood')).toContain('50%')

    document.body.append(hud.element)
    hud.dispose()
    hud.dispose()
    store.dispatch({
      type: 'nightAdvanced',
      night: { ...store.getState().night, timeS: 180, flooding: 75 }
    })
    expect(text(hud.element, '.hud-time')).toContain('11:00')
    expect(text(hud.element, '.hud-flood')).toContain('50%')
    expect(hud.element.isConnected).toBe(false)
  })
})
