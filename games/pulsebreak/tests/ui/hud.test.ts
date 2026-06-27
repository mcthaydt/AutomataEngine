import { describe, expect, it } from 'vitest'
import { createHud } from '../../src/ui/hud'
import { createGameStore } from '../../src/state/root'
import { PLAYER, WAVE_COUNT } from '../../src/config'

function startedStore() {
  const store = createGameStore()
  store.dispatch({ type: 'runStarted' })
  return store
}

const fillWidth = (hud: { element: HTMLElement }) =>
  hud.element.querySelector<HTMLElement>('.hud-health-fill')!.style.width
const text = (hud: { element: HTMLElement }, sel: string) =>
  hud.element.querySelector(sel)!.textContent

describe('hud', () => {
  it('paints the initial run state', () => {
    const hud = createHud(startedStore())
    expect(fillWidth(hud)).toBe('100%')
    expect(text(hud, '.hud-score')).toContain('0')
    expect(text(hud, '.hud-wave')).toContain(`1/${WAVE_COUNT}`)
    expect(text(hud, '.hud-best')).toContain('0')
    hud.dispose()
  })

  it('reflects score, wave, and health changes live', () => {
    const store = startedStore()
    const hud = createHud(store)
    store.dispatch({ type: 'enemyKilled', value: 250 })
    store.dispatch({ type: 'upgradeChosen', id: 'damage' })
    store.dispatch({ type: 'playerDamaged', amount: 25 })
    expect(text(hud, '.hud-score')).toContain('250')
    expect(text(hud, '.hud-wave')).toContain(`2/${WAVE_COUNT}`)
    expect(fillWidth(hud)).toBe(`${((PLAYER.startHealth - 25) / PLAYER.startHealth) * 100}%`)
    hud.dispose()
  })

  it('shows the best score after a run ends', () => {
    const store = startedStore()
    const hud = createHud(store)
    store.dispatch({ type: 'enemyKilled', value: 800 })
    store.dispatch({ type: 'playerDamaged', amount: PLAYER.startHealth })
    expect(text(hud, '.hud-best')).toContain('800')
    hud.dispose()
  })

  it('stops updating and detaches after dispose', () => {
    const store = startedStore()
    const hud = createHud(store)
    document.body.append(hud.element)
    hud.dispose()
    store.dispatch({ type: 'enemyKilled', value: 999 })
    expect(text(hud, '.hud-score')).not.toContain('999')
    expect(hud.element.isConnected).toBe(false)
  })
})
