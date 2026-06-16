import { describe, expect, it } from 'vitest'
import { createHud } from '../../src/ui/hud'
import { createGameStore } from '../../src/state/root'

const text = (el: HTMLElement, sel: string) => el.querySelector(sel)!.textContent

describe('createHud', () => {
  it('renders the initial session and updates on dispatch', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    const hud = createHud(store, 60)
    expect(text(hud.element, '.hud-lives')).toBe('Lives 3')
    expect(text(hud.element, '.hud-time')).toBe('1:00')

    store.dispatch({ type: 'bananaCollected', value: 2 })
    store.dispatch({ type: 'tickedMs', ms: 5000 })
    expect(text(hud.element, '.hud-bananas')).toBe('Bananas 2')
    expect(text(hud.element, '.hud-time')).toBe('0:55')
  })

  it('stops updating after dispose', () => {
    const store = createGameStore()
    store.dispatch({ type: 'levelStarted', levelId: 'w1-l1' })
    const hud = createHud(store, 60)
    hud.dispose()
    store.dispatch({ type: 'bananaCollected', value: 1 })
    expect(text(hud.element, '.hud-bananas')).toBe('Bananas 0')
  })

  it('removes its mounted element on dispose', () => {
    const store = createGameStore()
    const hud = createHud(store, 60)
    document.body.appendChild(hud.element)

    hud.dispose()

    expect(hud.element.isConnected).toBe(false)
  })
})
